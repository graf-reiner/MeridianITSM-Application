import { CloudflareApiError, type CloudflareClient } from './client.js';
import type { IngressEntry, TunnelConfiguration } from './types.js';

export interface ProvisionRouteInput {
  hostname: string;        // FQDN, e.g. "acme.meridianitsm.com"
  zoneId: string;          // DNS zone for the apex
  tunnelId: string;
  tunnelCname: string;     // e.g. "<tunnelId>.cfargotunnel.com"
  originService: string;   // ingress `service` value, e.g. "http://10.1.200.218:3000"
}

export interface ProvisionRouteResult {
  ingressInserted: boolean;       // false when the hostname was already in the ingress list
  dnsRecordId: string;
  dnsRecordCreated: boolean;      // false when an existing CNAME already pointed at the tunnel
}

export interface DeprovisionRouteInput {
  hostname: string;
  zoneId: string;
  tunnelId: string;
  dnsRecordId: string | null;
}

/**
 * Idempotent route provisioner. Safe to call repeatedly for the same
 * hostname — existing tunnel ingress entries and DNS CNAMEs are detected
 * and reused.
 *
 * The mutation-safety contract for tunnel ingress:
 *   - Cloudflare requires the LAST ingress entry to be a catch-all (no
 *     `hostname` key). We always splice the new entry at `catchAllIndex`,
 *     never at the end.
 *   - We re-GET the configuration after PUT to confirm the new hostname
 *     is present and the catch-all is still last; if either invariant is
 *     violated the call throws.
 */
export async function provisionCloudflareRoute(
  client: CloudflareClient,
  input: ProvisionRouteInput,
): Promise<ProvisionRouteResult> {
  // ── 1. Ingress: read, splice (if needed), write ──────────────────────────
  const envelope = await client.getTunnelConfiguration(input.tunnelId);
  const config: TunnelConfiguration = envelope.config ?? { ingress: [] };
  const existingIngress = Array.isArray(config.ingress) ? config.ingress : [];

  const alreadyPresent = existingIngress.some((entry) => entry.hostname === input.hostname);
  let ingressInserted = false;

  if (!alreadyPresent) {
    const catchAllIndex = findCatchAllIndex(existingIngress);
    const newEntry: IngressEntry = {
      hostname: input.hostname,
      service: input.originService,
    };

    const updatedIngress: IngressEntry[] =
      catchAllIndex >= 0
        ? [
            ...existingIngress.slice(0, catchAllIndex),
            newEntry,
            ...existingIngress.slice(catchAllIndex),
          ]
        : // No catch-all yet — insert ours, then append the standard 404 sentinel.
          [...existingIngress, newEntry, { service: 'http_status:404' } as IngressEntry];

    const mutated: TunnelConfiguration = { ...config, ingress: updatedIngress };
    await client.putTunnelConfiguration(input.tunnelId, mutated);

    // Re-fetch and verify our hostname is present and the catch-all is last.
    const verify = await client.getTunnelConfiguration(input.tunnelId);
    const verifyIngress = Array.isArray(verify.config?.ingress) ? verify.config.ingress : [];
    const ourEntryIdx = verifyIngress.findIndex((e) => e.hostname === input.hostname);
    if (ourEntryIdx === -1) {
      throw new Error(`Tunnel ingress write succeeded but ${input.hostname} is not present afterwards`);
    }
    const lastEntry = verifyIngress[verifyIngress.length - 1];
    if (lastEntry?.hostname) {
      throw new Error('Tunnel ingress catch-all sentinel is missing or no longer last');
    }
    ingressInserted = true;
  }

  // ── 2. DNS: lookup, create if missing ────────────────────────────────────
  const existingRecords = await client.listDnsRecords(input.zoneId, {
    name: input.hostname,
    type: 'CNAME',
  });

  let dnsRecordId: string;
  let dnsRecordCreated = false;
  const matching = existingRecords.find((r) => r.name === input.hostname);
  if (matching) {
    dnsRecordId = matching.id;
  } else {
    try {
      const created = await client.createDnsRecord(input.zoneId, {
        type: 'CNAME',
        name: input.hostname,
        content: input.tunnelCname,
        proxied: true,
        ttl: 1,
      });
      dnsRecordId = created.id;
      dnsRecordCreated = true;
    } catch (err) {
      // 81053: An identical record already exists. Treat as success and
      // refetch the existing record id so we can store it for cleanup later.
      if (err instanceof CloudflareApiError && err.hasCode(81053)) {
        const after = await client.listDnsRecords(input.zoneId, { name: input.hostname, type: 'CNAME' });
        const existing = after.find((r) => r.name === input.hostname);
        if (!existing) throw err;
        dnsRecordId = existing.id;
      } else {
        throw err;
      }
    }
  }

  return { ingressInserted, dnsRecordId, dnsRecordCreated };
}

/**
 * Removes a tenant's tunnel ingress entry and DNS record. Out of scope for
 * the initial provisioning PR — wired up in a follow-up. Stub left here so
 * call sites can compile against the final signature.
 */
export async function deprovisionCloudflareRoute(
  _client: CloudflareClient,
  _input: DeprovisionRouteInput,
): Promise<void> {
  throw new Error('deprovisionCloudflareRoute() is not yet implemented (deferred to follow-up PR)');
}

function findCatchAllIndex(ingress: IngressEntry[]): number {
  // The catch-all is the first entry without a `hostname` key. Cloudflare
  // requires it to be last, so in a well-formed config it should also be the
  // final element — but we accept either as the splice anchor.
  return ingress.findIndex((entry) => !entry.hostname);
}
