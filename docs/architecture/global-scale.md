# Global Scale Architecture

> Status: forward-looking design · Owner: Architect agent · Last updated: 2026-07-14
> This document outlines the infrastructure strategy for scaling Okolo from a regional app to a global platform with thousands of users across many countries.

## The Scaling Challenge

Our current prototype architecture relies on free public endpoints (OpenFreeMap for tiles, public Nominatim for geocoding) and a single-region Vercel+Supabase deployment. This breaks down at global scale due to:
1. **Dependency risk and rate limits:** Public Nominatim is strictly 1 req/sec. OpenFreeMap is a donation-funded single-maintainer project.
2. **Bandwidth costs:** Map tiles are bandwidth-heavy. Serving them through standard cloud egress (AWS, Vercel) becomes astronomically expensive at scale.
3. **Database latency:** A single Postgres database in Europe results in unacceptable latency (200ms+) for users in the US or Asia during map pans.

When comparing AWS vs. European providers (Scaleway/Hetzner) for this specific stack, the primary drivers are **egress bandwidth** (maps) and **memory** (planetary geocoding).

## 1. Map Tiles: Cloudflare R2 + PMTiles

To serve the entire planet, we need the full OpenStreetMap dataset (~120GB as a `.pmtiles` vector tile archive).

- **The Strategy:** Use Cloudflare R2 and Protomaps.
- **Implementation:** Host the 120GB planet `.pmtiles` file in a Cloudflare R2 bucket. MapLibre clients make HTTP byte-range requests directly to R2.
- **Why:** 
  - **Zero Egress Fees:** R2 charges nothing for egress. You only pay for storage (~$1.80/month for 120GB) and request operations.
  - **Edge Caching:** Cloudflare caches these byte-range requests globally, meaning map loads are instantaneous everywhere.
  - **Comparison:** AWS S3 egress would be prohibitively expensive. Mapbox Enterprise pricing scales steeply with usage. Cloudflare R2 + PMTiles effectively flattens map tile costs regardless of traffic.

## 2. Geocoding: Self-Hosted on Scaleway/Hetzner

Geocoding is the true bottleneck of the system. The 1 req/sec Nominatim cap will block user flows at scale. Searching the whole planet requires a geocoder with the entire global OSM database loaded into memory.

- **The Strategy:** Run a dedicated Photon (komoot's open-source geocoder) or Nominatim instance on a high-RAM bare metal server.
- **Implementation:** Provision a Scaleway Bare Metal or Hetzner AX-line dedicated server (e.g., 64GB RAM, 1TB NVMe). Place it behind Cloudflare to cache popular autocomplete queries (e.g., "New York").
- **Why:**
  - **Cost-Efficiency:** A 64GB RAM dedicated server in Europe costs ~€80-120/month. A comparable AWS EC2 instance (e.g., `m6id.2xlarge`) costs $300-$500+/month.
  - **Comparison:** Paid APIs like Google Maps or Mapbox Geocoding charge ~$5 per 1,000 requests. At millions of searches, paid APIs dwarf the cost of a dedicated box.

## 3. App Hosting: Vercel to Scaleway Serverless Containers

The Next.js application handles SSR, API routes, and MCP requests. 

- **The Strategy:** Stay on Vercel for the developer experience until compute/egress costs cross a threshold, then migrate to Scaleway.
- **Implementation (Next Phase):** Containerize the Next.js app (Docker) and deploy to Scaleway Serverless Containers or a Kubernetes cluster.
- **Why:**
  - **Bandwidth:** Vercel (and AWS) charge premium egress rates (~$0.09-$0.15/GB). Scaleway offers much more generous bandwidth allowances.
  - **Lock-in:** Since the app is built on the App Router and standard Postgres (not Vercel KV/Edge Config), the Docker transition is straightforward.

## 4. Database: Supabase Read Replicas

The core operational database is Supabase Postgres. Because the client queries the database on every viewport change (map pan), latency is critical. 

- **The Strategy:** Deploy Read Replicas close to the users.
- **Implementation:** Maintain the primary write database in Europe (Frankfurt/Paris). Use Supabase's Read Replica feature (available on the Pro tier) to spin up read-only instances in the US (e.g., US East) and Asia (e.g., Singapore).
- **Why:**
  - **Latency:** When an American user pans the map, the Next.js API route hits the US read replica (20ms latency) instead of crossing the Atlantic (120ms+ latency).
  - **Cost:** Supabase Pro ($25/mo) plus the compute cost of replicas (~$15-20/mo per region) is a highly efficient way to get a globally distributed database.

## Summary Architecture & Economics

At a scale of tens of thousands of global users, the monthly operating cost would look roughly like this:

| Component | Technology | Provider | Est. Monthly Cost |
| :--- | :--- | :--- | :--- |
| **Tiles** | PMTiles (Planet) | Cloudflare R2 | ~$2 (Zero egress) |
| **Geocoding** | Photon/Nominatim | Scaleway Bare Metal | ~$100 |
| **App Compute** | Next.js Containers | Scaleway Serverless | ~$20 - $50 |
| **Database** | Postgres (Write EU, Read US/AS) | Supabase Pro + Replicas | ~$60 - $80 |
| **Total** | | | **~$182 - $232** |

This setup avoids the massive bandwidth traps of AWS and the API key usage fees of Mapbox/Google, while delivering a sub-100ms experience globally.
