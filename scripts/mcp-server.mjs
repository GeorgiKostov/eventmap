// MCP server exposing the Umkreis event database to AI clients over stdio.
// This is the prototype of the "publish once, AI-readable everywhere" pitch:
// a municipality (or an AI assistant) talks to this instead of scraping HTML.
//
// Connect from Claude Code:  claude mcp add umkreis -- node scripts/mcp-server.mjs
// Or run standalone:         npm run mcp
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { searchEventCatalog, getEvent, listSources } from '../lib/db.js';
import { TOWNS } from '../lib/towns.js';

const CATEGORIES = ['family', 'festival', 'market', 'music', 'culture', 'food', 'sport', 'workshop'];

function slim(ev) {
  return {
    id: ev.id,
    title: ev.title,
    description: ev.description,
    starts_at: ev.starts_at,
    ends_at: ev.ends_at,
    all_day: !!ev.all_day,
    venue: ev.venue,
    address: ev.address,
    town: ev.town,
    lat: ev.lat,
    lng: ev.lng,
    categories: ev.categories,
    is_free: ev.is_free === 1 ? true : ev.is_free === 0 ? false : null,
    age_min: ev.age_min,
    age_max: ev.age_max,
    indoor: ev.indoor === 1 ? true : ev.indoor === 0 ? false : null,
    source: { name: ev.source_name, url: ev.source_url, kind: ev.src_kind },
  };
}

const server = new McpServer({ name: 'umkreis-events', version: '0.1.0' });

server.registerTool(
  'search_events',
  {
    title: 'Search local events',
    description:
      'Search upcoming events around Linz, Austria (region: Linz, Linz-Land, parts of Urfahr-Umgebung). ' +
      'All times are Europe/Vienna local. Data is aggregated from official municipal sources with per-event source links.',
    inputSchema: {
      query: z.string().optional().describe('Free-text match against title/description/venue (case-insensitive)'),
      date_from: z.string().optional().describe('YYYY-MM-DD (default: today)'),
      date_to: z.string().optional().describe('YYYY-MM-DD (default: no limit)'),
      category: z.enum(CATEGORIES).optional(),
      town: z.string().optional().describe(`e.g. ${Object.keys(TOWNS).slice(0, 6).join(', ')} …`),
      free_only: z.boolean().optional(),
      for_kids: z.boolean().optional().describe('Only events with an age recommendation or family category'),
      near_lat: z.number().optional(),
      near_lng: z.number().optional(),
      max_km: z.number().optional().describe('Radius filter, requires near_lat/near_lng (or defaults to Linz center)'),
      limit: z.number().optional().describe('Max results (default 25)'),
    },
  },
  async (args) => {
    // This tool is scoped to dated events; places (kind='place', no starts_at)
    // are a separate evergreen content type — not exposed here yet.
    const { events, total } = await searchEventCatalog({
      query: args.query,
      dateFrom: args.date_from,
      dateTo: args.date_to,
      category: args.category,
      town: args.town,
      freeOnly: args.free_only,
      forKids: args.for_kids,
      nearLat: args.near_lat,
      nearLng: args.near_lng,
      maxKm: args.max_km,
      limit: args.limit,
    });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ total, returned: events.length, events: events.map(slim) }, null, 1),
        },
      ],
    };
  }
);

server.registerTool(
  'get_event',
  {
    title: 'Get one event',
    description: 'Fetch a single event by id, including source attribution.',
    inputSchema: { id: z.number() },
  },
  async ({ id }) => {
    const ev = await getEvent(id);
    return {
      content: [{ type: 'text', text: ev ? JSON.stringify(slim(ev), null, 1) : 'Not found' }],
    };
  }
);

server.registerTool(
  'list_sources',
  {
    title: 'List data sources',
    description: 'The official sources this database is aggregated from, with working/broken status.',
    inputSchema: {},
  },
  async () => ({
    content: [{ type: 'text', text: JSON.stringify(await listSources(), null, 1) }],
  })
);

await server.connect(new StdioServerTransport());
