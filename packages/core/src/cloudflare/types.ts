// Cloudflare API DTOs — only the fields we actually consume. Cloudflare's API
// envelopes responses as { success, errors, messages, result } — the client
// unwraps `result` so consumers see these shapes directly.

export interface ZoneSummary {
  id: string;
  name: string;
  status: string;
}

export interface IngressEntry {
  hostname?: string;
  service: string;
  path?: string;
  originRequest?: Record<string, unknown>;
}

export interface TunnelConfiguration {
  ingress: IngressEntry[];
  // Cloudflare may include warpRouting and other top-level keys we must
  // preserve verbatim on PUT. We treat everything else as opaque.
  [key: string]: unknown;
}

export interface TunnelConfigurationEnvelope {
  tunnel_id: string;
  version: number;
  config: TunnelConfiguration;
  source?: string;
}

export interface DnsRecordSummary {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
  zone_id?: string;
}

export interface CreateDnsRecordInput {
  type: 'CNAME';
  name: string;
  content: string;
  proxied: true;
  ttl: 1;
  comment?: string;
}

export interface VerifyTokenResult {
  id: string;
  status: 'active' | 'disabled' | 'expired';
}

export interface TunnelInfo {
  id: string;
  name: string;
  status: string;
  conns_active_at?: string | null;
}

export interface CloudflareApiErrorBody {
  success: false;
  errors: Array<{ code: number; message: string }>;
  messages: Array<{ code: number; message: string }>;
}
