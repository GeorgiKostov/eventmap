import net from 'node:net';

const blocked = new net.BlockList();

for (const [network, prefix] of [
  ['0.0.0.0', 8],       // current network / unspecified
  ['10.0.0.0', 8],      // RFC1918
  ['100.64.0.0', 10],   // carrier-grade NAT
  ['127.0.0.0', 8],     // loopback
  ['169.254.0.0', 16],  // link-local
  ['172.16.0.0', 12],   // RFC1918
  ['192.0.0.0', 24],    // IETF protocol assignments
  ['192.0.2.0', 24],    // documentation
  ['192.168.0.0', 16],  // RFC1918
  ['198.18.0.0', 15],   // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24],  // documentation
  ['224.0.0.0', 4],     // multicast
  ['240.0.0.0', 4],     // reserved + broadcast
]) blocked.addSubnet(network, prefix, 'ipv4');

for (const [network, prefix] of [
  ['::', 128],          // unspecified
  ['::1', 128],         // loopback
  ['64:ff9b::', 96],    // well-known NAT64
  ['64:ff9b:1::', 48],  // local-use NAT64
  ['100::', 64],        // discard-only
  ['2001::', 23],       // IETF protocol assignments (incl. Teredo/benchmarking)
  ['2001:db8::', 32],   // documentation
  ['2002::', 16],       // deprecated 6to4 transition (embeds IPv4)
  ['3fff::', 20],       // documentation
  ['fc00::', 7],        // unique-local
  ['fe80::', 10],       // link-local
  ['fec0::', 10],       // deprecated site-local
  ['ff00::', 8],        // multicast
]) blocked.addSubnet(network, prefix, 'ipv6');

function mappedIpv4(ip) {
  const value = ip.toLowerCase();
  let match = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (match) return match[1];
  match = value.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!match) return null;
  const high = Number.parseInt(match[1], 16);
  const low = Number.parseInt(match[2], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

// Only globally routable unicast addresses may be used by the user-supplied
// URL reader. DNS resolution is checked separately and every redirect is
// re-resolved and pinned before connecting.
export function isPublicIp(ip) {
  if (net.isIPv4(ip)) return !blocked.check(ip, 'ipv4');
  if (!net.isIPv6(ip)) return false;
  const mapped = mappedIpv4(ip);
  if (mapped) return isPublicIp(mapped);
  return !blocked.check(ip, 'ipv6');
}
