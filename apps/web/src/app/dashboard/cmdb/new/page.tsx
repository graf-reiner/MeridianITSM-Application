'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiDatabase,
  mdiServer,
  mdiDesktopClassic,
  mdiLanConnect,
  mdiCloud,
  mdiCog,
  mdiApplication,
  mdiShieldLock,
  mdiPackageVariant,
  mdiArrowLeft,
  mdiArrowRight,
  mdiCheck,
  mdiPlus,
  mdiChevronRight,
} from '@mdi/js';
import { VendorPicker } from '@/components/VendorPicker';

// ---- Types ------------------------------------------------------------------

interface CmdbClass {
  id: string;
  className: string;
  classKey: string;
  icon?: string;
}

interface CmdbStatus {
  id: string;
  statusName: string;
  statusKey: string;
  statusType: string;
}

interface CmdbEnvironment {
  id: string;
  envName: string;
  envKey: string;
}

interface CmdbVendor {
  id: string;
  name: string;
}

interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface GroupOption {
  id: string;
  name: string;
}

// ---- Helpers ----------------------------------------------------------------

function getClassIcon(slug: string): string {
  switch (slug) {
    case 'server':
    case 'virtual_machine':
      return mdiServer;
    case 'workstation':
      return mdiDesktopClassic;
    case 'network_device':
    case 'load_balancer':
      return mdiLanConnect;
    case 'database':
      return mdiDatabase;
    case 'cloud_resource':
      return mdiCloud;
    case 'business_service':
    case 'technical_service':
      return mdiCog;
    case 'application':
    case 'application_instance':
    case 'saas_application':
      return mdiApplication;
    case 'dns_endpoint':
    case 'certificate':
      return mdiShieldLock;
    default:
      return mdiPackageVariant;
  }
}

const STEPS = [
  { label: 'Select Class', num: 1 },
  { label: 'General Info', num: 2 },
  { label: 'Ownership', num: 3 },
  { label: 'Technical Details', num: 4 },
  { label: 'Review & Save', num: 5 },
];

const CRITICALITY_OPTIONS = ['low', 'medium', 'high', 'mission_critical'];

// ---- Shared Styles ----------------------------------------------------------

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid var(--border-secondary)',
  borderRadius: 8,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  backgroundColor: 'var(--bg-primary)',
  color: 'var(--text-primary)',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  marginBottom: 4,
};

const fieldGroup: React.CSSProperties = {
  marginBottom: 16,
};

const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-primary)',
  border: '1px solid var(--border-primary)',
  borderRadius: 10,
  padding: 24,
};

// ---- Component --------------------------------------------------------------

export default function CMDBCreatePage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lookup data
  const [classes, setClasses] = useState<CmdbClass[]>([]);
  const [lifecycleStatuses, setLifecycleStatuses] = useState<CmdbStatus[]>([]);
  const [operationalStatuses, setOperationalStatuses] = useState<CmdbStatus[]>([]);
  const [environments, setEnvironments] = useState<CmdbEnvironment[]>([]);
  const [vendors, setVendors] = useState<CmdbVendor[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);

  // Form data
  const [classId, setClassId] = useState('');
  const [classSlug, setClassSlug] = useState('');
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [lifecycleStatusId, setLifecycleStatusId] = useState('');
  const [operationalStatusId, setOperationalStatusId] = useState('');
  const [environmentId, setEnvironmentId] = useState('');
  const [criticality, setCriticality] = useState('');
  const [description, setDescription] = useState('');

  // Ownership
  const [businessOwnerId, setBusinessOwnerId] = useState('');
  const [technicalOwnerId, setTechnicalOwnerId] = useState('');
  const [supportGroupId, setSupportGroupId] = useState('');
  const [manufacturerId, setManufacturerId] = useState('');

  // Technical details (common)
  const [hostname, setHostname] = useState('');
  const [fqdn, setFqdn] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [assetTag, setAssetTag] = useState('');
  const [externalId, setExternalId] = useState('');
  const [model, setModel] = useState('');
  const [version, setVersion] = useState('');
  const [edition, setEdition] = useState('');

  // Extension fields (server / vm)
  const [serverType, setServerType] = useState('');
  const [operatingSystem, setOperatingSystem] = useState('');
  const [osVersion, setOsVersion] = useState('');
  const [cpuCount, setCpuCount] = useState('');
  const [memoryGb, setMemoryGb] = useState('');
  const [storageGb, setStorageGb] = useState('');
  const [backupRequired, setBackupRequired] = useState(false);
  const [backupPolicy, setBackupPolicy] = useState('');
  const [patchGroup, setPatchGroup] = useState('');

  // Extension fields (application)
  const [applicationType, setApplicationType] = useState('');
  const [installType, setInstallType] = useState('');
  const [businessFunction, setBusinessFunction] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [documentationUrl, setDocumentationUrl] = useState('');
  const [primaryLanguage, setPrimaryLanguage] = useState('');
  const [runtimePlatform, setRuntimePlatform] = useState('');
  const [authenticationMethod, setAuthenticationMethod] = useState('');
  const [internetFacing, setInternetFacing] = useState(false);
  const [complianceScope, setComplianceScope] = useState('');

  // Extension fields (database)
  const [dbEngine, setDbEngine] = useState('');
  const [dbVersion, setDbVersion] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [dbPort, setDbPort] = useState('');
  const [dbBackupRequired, setDbBackupRequired] = useState(false);
  const [backupFrequency, setBackupFrequency] = useState('');
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [containsSensitiveData, setContainsSensitiveData] = useState(false);

  // Extension fields (network device)
  const [deviceType, setDeviceType] = useState('');
  const [firmwareVersion, setFirmwareVersion] = useState('');
  const [managementIp, setManagementIp] = useState('');
  const [macAddress, setMacAddress] = useState('');
  const [rackLocation, setRackLocation] = useState('');
  const [haRole, setHaRole] = useState('');

  // Extension fields (cloud resource)
  const [cloudProvider, setCloudProvider] = useState('');
  const [region, setRegion] = useState('');
  const [resourceGroup, setResourceGroup] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [nativeResourceId, setNativeResourceId] = useState('');

  // Extension fields (dns / certificate)
  const [endpointType, setEndpointType] = useState('');
  const [protocol, setProtocol] = useState('');
  const [port, setPort] = useState('');
  const [url, setUrl] = useState('');
  const [dnsName, setDnsName] = useState('');
  const [certificateExpiryDate, setCertificateExpiryDate] = useState('');
  const [certificateIssuer, setCertificateIssuer] = useState('');
  const [tlsRequired, setTlsRequired] = useState(false);

  // Extension fields (service)
  const [serviceType, setServiceType] = useState('');
  const [serviceTier, setServiceTier] = useState('');
  const [slaName, setSlaName] = useState('');
  const [availabilityTarget, setAvailabilityTarget] = useState('');
  const [rtoMinutes, setRtoMinutes] = useState('');
  const [rpoMinutes, setRpoMinutes] = useState('');

  // ---- Fetch lookups --------------------------------------------------------

  useEffect(() => {
    const fetchJson = async (url: string) => {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    };

    void fetchJson('/api/v1/cmdb/classes').then((d) => setClasses(d.data ?? d ?? []));
    void fetchJson('/api/v1/cmdb/statuses?statusType=lifecycle').then((d) => setLifecycleStatuses(d.data ?? d ?? []));
    void fetchJson('/api/v1/cmdb/statuses?statusType=operational').then((d) => setOperationalStatuses(d.data ?? d ?? []));
    void fetchJson('/api/v1/cmdb/environments').then((d) => setEnvironments(d.data ?? d ?? []));
    void fetchJson('/api/v1/cmdb/vendors').then((d) => setVendors(d.data ?? d ?? []));
    void fetchJson('/api/v1/settings/groups').then((d) => {
      const all = d.data ?? d ?? [];
      setGroups(all.filter((g: GroupOption & { isCmdbSupportGroup?: boolean }) => g.isCmdbSupportGroup));
    });
  }, []);

  // Fetch users with a debounced search (loaded once on step 3)
  useEffect(() => {
    if (step === 3 && users.length === 0) {
      void fetch('/api/v1/settings/users?pageSize=200', { credentials: 'include' })
        .then((r) => r.ok ? r.json() : { data: [] })
        .then((d) => setUsers(d.data ?? d.users ?? d ?? []));
    }
  }, [step, users.length]);

  // ---- Class category helpers -----------------------------------------------

  const isServer = classSlug === 'server' || classSlug === 'virtual_machine';
  const isApp = classSlug === 'application' || classSlug === 'application_instance' || classSlug === 'saas_application';
  const isDb = classSlug === 'database';
  const isNetwork = classSlug === 'network_device' || classSlug === 'load_balancer';
  const isCloud = classSlug === 'cloud_resource';
  const isDns = classSlug === 'dns_endpoint' || classSlug === 'certificate';
  const isService = classSlug === 'business_service' || classSlug === 'technical_service';

  // ---- Build payload --------------------------------------------------------

  function buildPayload() {
    const payload: Record<string, unknown> = {
      classId,
      name,
      displayName: displayName || undefined,
      lifecycleStatusId: lifecycleStatusId || undefined,
      operationalStatusId: operationalStatusId || undefined,
      environmentId: environmentId || undefined,
      criticality: criticality || undefined,
      description: description || undefined,
      businessOwnerId: businessOwnerId || undefined,
      technicalOwnerId: technicalOwnerId || undefined,
      supportGroupId: supportGroupId || undefined,
      manufacturerId: manufacturerId || undefined,
      hostname: hostname || undefined,
      fqdn: fqdn || undefined,
      ipAddress: ipAddress || undefined,
      serialNumber: serialNumber || undefined,
      assetTag: assetTag || undefined,
      externalId: externalId || undefined,
      model: model || undefined,
      version: version || undefined,
      edition: edition || undefined,
    };

    if (isServer) {
      payload.serverExt = {
        serverType: serverType || undefined,
        operatingSystem: operatingSystem || undefined,
        osVersion: osVersion || undefined,
        cpuCount: cpuCount ? Number(cpuCount) : undefined,
        memoryGb: memoryGb ? Number(memoryGb) : undefined,
        storageGb: storageGb ? Number(storageGb) : undefined,
        backupRequired,
        backupPolicy: backupPolicy || undefined,
        patchGroup: patchGroup || undefined,
      };
    }

    if (isApp) {
      payload.applicationExt = {
        applicationType: applicationType || undefined,
        installType: installType || undefined,
        businessFunction: businessFunction || undefined,
        repoUrl: repoUrl || undefined,
        documentationUrl: documentationUrl || undefined,
        primaryLanguage: primaryLanguage || undefined,
        runtimePlatform: runtimePlatform || undefined,
        authenticationMethod: authenticationMethod || undefined,
        internetFacing,
        complianceScope: complianceScope || undefined,
      };
    }

    if (isDb) {
      payload.databaseExt = {
        dbEngine: dbEngine || undefined,
        dbVersion: dbVersion || undefined,
        instanceName: instanceName || undefined,
        port: dbPort ? Number(dbPort) : undefined,
        backupRequired: dbBackupRequired,
        backupFrequency: backupFrequency || undefined,
        encryptionEnabled,
        containsSensitiveData,
      };
    }

    if (isNetwork) {
      payload.networkExt = {
        deviceType: deviceType || undefined,
        firmwareVersion: firmwareVersion || undefined,
        managementIp: managementIp || undefined,
        macAddress: macAddress || undefined,
        rackLocation: rackLocation || undefined,
        haRole: haRole || undefined,
      };
    }

    if (isCloud) {
      payload.cloudExt = {
        cloudProvider: cloudProvider || undefined,
        region: region || undefined,
        resourceGroup: resourceGroup || undefined,
        resourceType: resourceType || undefined,
        nativeResourceId: nativeResourceId || undefined,
      };
    }

    if (isDns) {
      payload.endpointExt = {
        endpointType: endpointType || undefined,
        protocol: protocol || undefined,
        port: port ? Number(port) : undefined,
        url: url || undefined,
        dnsName: dnsName || undefined,
        certificateExpiryDate: certificateExpiryDate || undefined,
        certificateIssuer: certificateIssuer || undefined,
        tlsRequired,
      };
    }

    if (isService) {
      payload.serviceExt = {
        serviceType: serviceType || undefined,
        serviceTier: serviceTier || undefined,
        slaName: slaName || undefined,
        availabilityTarget: availabilityTarget ? Number(availabilityTarget) : undefined,
        rtoMinutes: rtoMinutes ? Number(rtoMinutes) : undefined,
        rpoMinutes: rpoMinutes ? Number(rpoMinutes) : undefined,
      };
    }

    return payload;
  }

  // ---- Submit ---------------------------------------------------------------

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/cmdb/cis', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `Failed to create CI: ${res.status}`);
      }
      const created = await res.json() as { id: string };
      router.push(`/dashboard/cmdb/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  // ---- Validation -----------------------------------------------------------

  function canAdvance(): boolean {
    if (step === 1) return !!classId;
    if (step === 2) return !!name.trim();
    return true;
  }

  // ---- Render helpers -------------------------------------------------------

  const selectedClass = classes.find((c) => c.id === classId);

  function renderStepIndicator() {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28, overflowX: 'auto', paddingBottom: 4 }}>
        {STEPS.map((s, idx) => {
          const isActive = s.num === step;
          const isDone = s.num < step;
          return (
            <div key={s.num} style={{ display: 'flex', alignItems: 'center' }}>
              <button
                onClick={() => { if (isDone) setStep(s.num); }}
                disabled={!isDone && !isActive}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 20,
                  border: 'none',
                  cursor: isDone ? 'pointer' : 'default',
                  backgroundColor: isActive ? 'var(--accent-primary)' : isDone ? 'var(--badge-green-bg)' : 'var(--bg-tertiary)',
                  color: isActive ? 'var(--bg-primary)' : isDone ? '#065f46' : 'var(--text-muted)',
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  whiteSpace: 'nowrap',
                }}
              >
                {isDone ? (
                  <Icon path={mdiCheck} size={0.65} color="currentColor" />
                ) : (
                  <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : 'var(--border-secondary)', color: isActive ? '#fff' : 'var(--text-muted)' }}>
                    {s.num}
                  </span>
                )}
                {s.label}
              </button>
              {idx < STEPS.length - 1 && (
                <Icon path={mdiChevronRight} size={0.7} color="var(--text-placeholder)" style={{ margin: '0 2px', flexShrink: 0 }} />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ---- Step 1: Select Class -------------------------------------------------

  function renderStep1() {
    return (
      <div style={cardStyle}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Select CI Class</h2>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-muted)' }}>Choose the class that best describes this configuration item. This determines which extension fields are available.</p>

        {classes.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-placeholder)', fontSize: 14 }}>Loading classes...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {classes.map((cls) => {
              const selected = cls.id === classId;
              return (
                <button
                  key={cls.id}
                  onClick={() => { setClassId(cls.id); setClassSlug(cls.classKey); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 14px',
                    borderRadius: 8,
                    border: selected ? '2px solid var(--accent-primary)' : '1px solid var(--border-secondary)',
                    backgroundColor: selected ? 'var(--accent-primary-subtle, rgba(59,130,246,0.06))' : 'var(--bg-primary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Icon path={getClassIcon(cls.classKey)} size={1} color={selected ? 'var(--accent-primary)' : 'var(--text-muted)'} />
                  <span style={{ fontSize: 14, fontWeight: selected ? 600 : 500, color: selected ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                    {cls.className}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ---- Step 2: General Info -------------------------------------------------

  function renderStep2() {
    return (
      <div style={cardStyle}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>General Information</h2>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-muted)' }}>Provide the basic information for this configuration item.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0 20px' }}>
          <div style={fieldGroup}>
            <label style={labelStyle}>Name <span style={{ color: 'var(--accent-danger)' }}>*</span></label>
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. PROD-DB-01" />
          </div>
          <div style={fieldGroup}>
            <label style={labelStyle}>Display Name</label>
            <input style={inputStyle} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Friendly display name" />
          </div>
          <div style={fieldGroup}>
            <label style={labelStyle}>Lifecycle Status</label>
            <select style={selectStyle} value={lifecycleStatusId} onChange={(e) => setLifecycleStatusId(e.target.value)}>
              <option value="">-- Select --</option>
              {lifecycleStatuses.map((s) => <option key={s.id} value={s.id}>{s.statusName}</option>)}
            </select>
          </div>
          <div style={fieldGroup}>
            <label style={labelStyle}>Operational Status</label>
            <select style={selectStyle} value={operationalStatusId} onChange={(e) => setOperationalStatusId(e.target.value)}>
              <option value="">-- Select --</option>
              {operationalStatuses.map((s) => <option key={s.id} value={s.id}>{s.statusName}</option>)}
            </select>
          </div>
          <div style={fieldGroup}>
            <label style={labelStyle}>Environment</label>
            <select style={selectStyle} value={environmentId} onChange={(e) => setEnvironmentId(e.target.value)}>
              <option value="">-- Select --</option>
              {environments.map((e) => <option key={e.id} value={e.id}>{e.envName}</option>)}
            </select>
          </div>
          <div style={fieldGroup}>
            <label style={labelStyle}>Criticality</label>
            <select style={selectStyle} value={criticality} onChange={(e) => setCriticality(e.target.value)}>
              <option value="">-- Select --</option>
              {CRITICALITY_OPTIONS.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div style={{ ...fieldGroup, gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Description</label>
            <textarea
              style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this CI..."
            />
          </div>
        </div>
      </div>
    );
  }

  // ---- Step 3: Ownership ----------------------------------------------------

  function renderStep3() {
    return (
      <div style={cardStyle}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Ownership</h2>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-muted)' }}>Assign ownership and support responsibility.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0 20px' }}>
          <div style={fieldGroup}>
            <label style={labelStyle}>Business Owner</label>
            <select style={selectStyle} value={businessOwnerId} onChange={(e) => setBusinessOwnerId(e.target.value)}>
              <option value="">-- Select --</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</option>)}
            </select>
          </div>
          <div style={fieldGroup}>
            <label style={labelStyle}>Technical Owner</label>
            <select style={selectStyle} value={technicalOwnerId} onChange={(e) => setTechnicalOwnerId(e.target.value)}>
              <option value="">-- Select --</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</option>)}
            </select>
          </div>
          <div style={fieldGroup}>
            <label style={labelStyle}>Support Group</label>
            <select style={selectStyle} value={supportGroupId} onChange={(e) => setSupportGroupId(e.target.value)}>
              <option value="">-- Select --</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div style={fieldGroup}>
            <label style={labelStyle}>Manufacturer / Vendor</label>
            <VendorPicker
              value={manufacturerId}
              onChange={setManufacturerId}
              style={selectStyle}
              onVendorCreated={(v) =>
                setVendors((prev) =>
                  prev.some((p) => p.id === v.id) ? prev : [...prev, { id: v.id, name: v.name }],
                )
              }
            />
          </div>
        </div>
      </div>
    );
  }

  // ---- Step 4: Technical Details --------------------------------------------

  function renderStep4() {
    return (
      <div style={cardStyle}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Technical Details</h2>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-muted)' }}>Common technical fields and class-specific extensions for {selectedClass?.className ?? 'this CI'}.</p>

        {/* Common fields */}
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-primary)', paddingBottom: 8 }}>Common Fields</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0 20px', marginBottom: 24 }}>
          <div style={fieldGroup}>
            <label style={labelStyle}>Hostname</label>
            <input style={inputStyle} value={hostname} onChange={(e) => setHostname(e.target.value)} />
          </div>
          <div style={fieldGroup}>
            <label style={labelStyle}>FQDN</label>
            <input style={inputStyle} value={fqdn} onChange={(e) => setFqdn(e.target.value)} />
          </div>
          <div style={fieldGroup}>
            <label style={labelStyle}>IP Address</label>
            <input style={inputStyle} value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} />
          </div>
          <div style={fieldGroup}>
            <label style={labelStyle}>Serial Number</label>
            <input style={inputStyle} value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
          </div>
          <div style={fieldGroup}>
            <label style={labelStyle}>Asset Tag</label>
            <input style={inputStyle} value={assetTag} onChange={(e) => setAssetTag(e.target.value)} />
          </div>
          <div style={fieldGroup}>
            <label style={labelStyle}>External ID</label>
            <input style={inputStyle} value={externalId} onChange={(e) => setExternalId(e.target.value)} />
          </div>
          <div style={fieldGroup}>
            <label style={labelStyle}>Model</label>
            <input style={inputStyle} value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
          <div style={fieldGroup}>
            <label style={labelStyle}>Version</label>
            <input style={inputStyle} value={version} onChange={(e) => setVersion(e.target.value)} />
          </div>
          <div style={fieldGroup}>
            <label style={labelStyle}>Edition</label>
            <input style={inputStyle} value={edition} onChange={(e) => setEdition(e.target.value)} />
          </div>
        </div>

        {/* Server / VM extension */}
        {isServer && (
          <>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-primary)', paddingBottom: 8 }}>Server / VM Extension</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0 20px', marginBottom: 24 }}>
              <div style={fieldGroup}>
                <label style={labelStyle}>Server Type</label>
                <input style={inputStyle} value={serverType} onChange={(e) => setServerType(e.target.value)} placeholder="e.g. physical, virtual" />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Operating System</label>
                <input style={inputStyle} value={operatingSystem} onChange={(e) => setOperatingSystem(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>OS Version</label>
                <input style={inputStyle} value={osVersion} onChange={(e) => setOsVersion(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>CPU Count</label>
                <input style={inputStyle} type="number" value={cpuCount} onChange={(e) => setCpuCount(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Memory (GB)</label>
                <input style={inputStyle} type="number" value={memoryGb} onChange={(e) => setMemoryGb(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Storage (GB)</label>
                <input style={inputStyle} type="number" value={storageGb} onChange={(e) => setStorageGb(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Patch Group</label>
                <input style={inputStyle} value={patchGroup} onChange={(e) => setPatchGroup(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Backup Policy</label>
                <input style={inputStyle} value={backupPolicy} onChange={(e) => setBackupPolicy(e.target.value)} />
              </div>
              <div style={{ ...fieldGroup, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="backupRequired" checked={backupRequired} onChange={(e) => setBackupRequired(e.target.checked)} />
                <label htmlFor="backupRequired" style={{ fontSize: 14, color: 'var(--text-primary)', cursor: 'pointer' }}>Backup Required</label>
              </div>
            </div>
          </>
        )}

        {/* Application extension */}
        {isApp && (
          <>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-primary)', paddingBottom: 8 }}>Application Extension</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0 20px', marginBottom: 24 }}>
              <div style={fieldGroup}>
                <label style={labelStyle}>Application Type</label>
                <input style={inputStyle} value={applicationType} onChange={(e) => setApplicationType(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Install Type</label>
                <input style={inputStyle} value={installType} onChange={(e) => setInstallType(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Business Function</label>
                <input style={inputStyle} value={businessFunction} onChange={(e) => setBusinessFunction(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Repository URL</label>
                <input style={inputStyle} value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Documentation URL</label>
                <input style={inputStyle} value={documentationUrl} onChange={(e) => setDocumentationUrl(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Primary Language</label>
                <input style={inputStyle} value={primaryLanguage} onChange={(e) => setPrimaryLanguage(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Runtime Platform</label>
                <input style={inputStyle} value={runtimePlatform} onChange={(e) => setRuntimePlatform(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Authentication Method</label>
                <input style={inputStyle} value={authenticationMethod} onChange={(e) => setAuthenticationMethod(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Compliance Scope</label>
                <input style={inputStyle} value={complianceScope} onChange={(e) => setComplianceScope(e.target.value)} />
              </div>
              <div style={{ ...fieldGroup, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="internetFacing" checked={internetFacing} onChange={(e) => setInternetFacing(e.target.checked)} />
                <label htmlFor="internetFacing" style={{ fontSize: 14, color: 'var(--text-primary)', cursor: 'pointer' }}>Internet Facing</label>
              </div>
            </div>
          </>
        )}

        {/* Database extension */}
        {isDb && (
          <>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-primary)', paddingBottom: 8 }}>Database Extension</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0 20px', marginBottom: 24 }}>
              <div style={fieldGroup}>
                <label style={labelStyle}>DB Engine</label>
                <input style={inputStyle} value={dbEngine} onChange={(e) => setDbEngine(e.target.value)} placeholder="e.g. PostgreSQL, MySQL" />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>DB Version</label>
                <input style={inputStyle} value={dbVersion} onChange={(e) => setDbVersion(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Instance Name</label>
                <input style={inputStyle} value={instanceName} onChange={(e) => setInstanceName(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Port</label>
                <input style={inputStyle} type="number" value={dbPort} onChange={(e) => setDbPort(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Backup Frequency</label>
                <input style={inputStyle} value={backupFrequency} onChange={(e) => setBackupFrequency(e.target.value)} />
              </div>
              <div style={{ ...fieldGroup, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="dbBackupRequired" checked={dbBackupRequired} onChange={(e) => setDbBackupRequired(e.target.checked)} />
                <label htmlFor="dbBackupRequired" style={{ fontSize: 14, color: 'var(--text-primary)', cursor: 'pointer' }}>Backup Required</label>
              </div>
              <div style={{ ...fieldGroup, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="encryptionEnabled" checked={encryptionEnabled} onChange={(e) => setEncryptionEnabled(e.target.checked)} />
                <label htmlFor="encryptionEnabled" style={{ fontSize: 14, color: 'var(--text-primary)', cursor: 'pointer' }}>Encryption Enabled</label>
              </div>
              <div style={{ ...fieldGroup, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="containsSensitiveData" checked={containsSensitiveData} onChange={(e) => setContainsSensitiveData(e.target.checked)} />
                <label htmlFor="containsSensitiveData" style={{ fontSize: 14, color: 'var(--text-primary)', cursor: 'pointer' }}>Contains Sensitive Data</label>
              </div>
            </div>
          </>
        )}

        {/* Network device extension */}
        {isNetwork && (
          <>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-primary)', paddingBottom: 8 }}>Network Device Extension</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0 20px', marginBottom: 24 }}>
              <div style={fieldGroup}>
                <label style={labelStyle}>Device Type</label>
                <input style={inputStyle} value={deviceType} onChange={(e) => setDeviceType(e.target.value)} placeholder="e.g. router, switch, firewall" />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Firmware Version</label>
                <input style={inputStyle} value={firmwareVersion} onChange={(e) => setFirmwareVersion(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Management IP</label>
                <input style={inputStyle} value={managementIp} onChange={(e) => setManagementIp(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>MAC Address</label>
                <input style={inputStyle} value={macAddress} onChange={(e) => setMacAddress(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Rack Location</label>
                <input style={inputStyle} value={rackLocation} onChange={(e) => setRackLocation(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>HA Role</label>
                <input style={inputStyle} value={haRole} onChange={(e) => setHaRole(e.target.value)} placeholder="e.g. primary, secondary" />
              </div>
            </div>
          </>
        )}

        {/* Cloud resource extension */}
        {isCloud && (
          <>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-primary)', paddingBottom: 8 }}>Cloud Resource Extension</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0 20px', marginBottom: 24 }}>
              <div style={fieldGroup}>
                <label style={labelStyle}>Cloud Provider</label>
                <input style={inputStyle} value={cloudProvider} onChange={(e) => setCloudProvider(e.target.value)} placeholder="e.g. AWS, Azure, GCP" />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Region</label>
                <input style={inputStyle} value={region} onChange={(e) => setRegion(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Resource Group</label>
                <input style={inputStyle} value={resourceGroup} onChange={(e) => setResourceGroup(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Resource Type</label>
                <input style={inputStyle} value={resourceType} onChange={(e) => setResourceType(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Native Resource ID</label>
                <input style={inputStyle} value={nativeResourceId} onChange={(e) => setNativeResourceId(e.target.value)} />
              </div>
            </div>
          </>
        )}

        {/* DNS / Certificate extension */}
        {isDns && (
          <>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-primary)', paddingBottom: 8 }}>Endpoint / Certificate Extension</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0 20px', marginBottom: 24 }}>
              <div style={fieldGroup}>
                <label style={labelStyle}>Endpoint Type</label>
                <input style={inputStyle} value={endpointType} onChange={(e) => setEndpointType(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Protocol</label>
                <input style={inputStyle} value={protocol} onChange={(e) => setProtocol(e.target.value)} placeholder="e.g. HTTPS, TCP" />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Port</label>
                <input style={inputStyle} type="number" value={port} onChange={(e) => setPort(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>URL</label>
                <input style={inputStyle} value={url} onChange={(e) => setUrl(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>DNS Name</label>
                <input style={inputStyle} value={dnsName} onChange={(e) => setDnsName(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Certificate Expiry Date</label>
                <input style={inputStyle} type="date" value={certificateExpiryDate} onChange={(e) => setCertificateExpiryDate(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Certificate Issuer</label>
                <input style={inputStyle} value={certificateIssuer} onChange={(e) => setCertificateIssuer(e.target.value)} />
              </div>
              <div style={{ ...fieldGroup, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="tlsRequired" checked={tlsRequired} onChange={(e) => setTlsRequired(e.target.checked)} />
                <label htmlFor="tlsRequired" style={{ fontSize: 14, color: 'var(--text-primary)', cursor: 'pointer' }}>TLS Required</label>
              </div>
            </div>
          </>
        )}

        {/* Service extension */}
        {isService && (
          <>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-primary)', paddingBottom: 8 }}>Service Extension</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0 20px', marginBottom: 24 }}>
              <div style={fieldGroup}>
                <label style={labelStyle}>Service Type</label>
                <input style={inputStyle} value={serviceType} onChange={(e) => setServiceType(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Service Tier</label>
                <input style={inputStyle} value={serviceTier} onChange={(e) => setServiceTier(e.target.value)} placeholder="e.g. Gold, Silver, Bronze" />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>SLA Name</label>
                <input style={inputStyle} value={slaName} onChange={(e) => setSlaName(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Availability Target (%)</label>
                <input style={inputStyle} type="number" step="0.01" value={availabilityTarget} onChange={(e) => setAvailabilityTarget(e.target.value)} placeholder="e.g. 99.9" />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>RTO (minutes)</label>
                <input style={inputStyle} type="number" value={rtoMinutes} onChange={(e) => setRtoMinutes(e.target.value)} />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>RPO (minutes)</label>
                <input style={inputStyle} type="number" value={rpoMinutes} onChange={(e) => setRpoMinutes(e.target.value)} />
              </div>
            </div>
          </>
        )}

        {!isServer && !isApp && !isDb && !isNetwork && !isCloud && !isDns && !isService && (
          <p style={{ fontSize: 13, color: 'var(--text-placeholder)', fontStyle: 'italic' }}>No class-specific extension fields for this CI class.</p>
        )}
      </div>
    );
  }

  // ---- Step 5: Review -------------------------------------------------------

  function renderStep5() {
    const payload = buildPayload();

    function ReviewRow({ label, value }: { label: string; value: string | undefined | null }) {
      if (!value) return null;
      return (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--bg-tertiary)', fontSize: 14 }}>
          <span style={{ color: 'var(--text-muted)', flexShrink: 0, marginRight: 12 }}>{label}</span>
          <span style={{ color: 'var(--text-primary)', textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
        </div>
      );
    }

    function ReviewSection({ title, entries }: { title: string; entries: [string, string | undefined | null][] }) {
      const hasValues = entries.some(([, v]) => !!v);
      if (!hasValues) return null;
      return (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h3>
          {entries.map(([label, value]) => <ReviewRow key={label} label={label} value={value} />)}
        </div>
      );
    }

    const ownerLabel = (id: string) => {
      const u = users.find((u) => u.id === id);
      return u ? `${u.firstName} ${u.lastName}` : id;
    };
    const groupLabel = (id: string) => groups.find((g) => g.id === id)?.name ?? id;
    const vendorLabel = (id: string) => vendors.find((v) => v.id === id)?.name ?? id;
    const statusLabel = (id: string, list: CmdbStatus[]) => list.find((s) => s.id === id)?.statusName ?? id;
    const envLabel = (id: string) => environments.find((e) => e.id === id)?.envName ?? id;

    return (
      <div>
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Review & Save</h2>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-muted)' }}>Review the configuration item details before saving.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          <ReviewSection title="General Information" entries={[
            ['Class', selectedClass?.className ?? ''],
            ['Name', name],
            ['Display Name', displayName],
            ['Lifecycle Status', lifecycleStatusId ? statusLabel(lifecycleStatusId, lifecycleStatuses) : undefined],
            ['Operational Status', operationalStatusId ? statusLabel(operationalStatusId, operationalStatuses) : undefined],
            ['Environment', environmentId ? envLabel(environmentId) : undefined],
            ['Criticality', criticality ? criticality.replace(/_/g, ' ') : undefined],
            ['Description', description],
          ]} />

          <ReviewSection title="Ownership" entries={[
            ['Business Owner', businessOwnerId ? ownerLabel(businessOwnerId) : undefined],
            ['Technical Owner', technicalOwnerId ? ownerLabel(technicalOwnerId) : undefined],
            ['Support Group', supportGroupId ? groupLabel(supportGroupId) : undefined],
            ['Manufacturer', manufacturerId ? vendorLabel(manufacturerId) : undefined],
          ]} />

          <ReviewSection title="Technical Details" entries={[
            ['Hostname', hostname],
            ['FQDN', fqdn],
            ['IP Address', ipAddress],
            ['Serial Number', serialNumber],
            ['Asset Tag', assetTag],
            ['External ID', externalId],
            ['Model', model],
            ['Version', version],
            ['Edition', edition],
          ]} />

          {isServer && (
            <ReviewSection title="Server / VM Extension" entries={[
              ['Server Type', serverType],
              ['Operating System', operatingSystem],
              ['OS Version', osVersion],
              ['CPU Count', cpuCount],
              ['Memory (GB)', memoryGb],
              ['Storage (GB)', storageGb],
              ['Backup Required', backupRequired ? 'Yes' : undefined],
              ['Backup Policy', backupPolicy],
              ['Patch Group', patchGroup],
            ]} />
          )}

          {isApp && (
            <ReviewSection title="Application Extension" entries={[
              ['Application Type', applicationType],
              ['Install Type', installType],
              ['Business Function', businessFunction],
              ['Repository URL', repoUrl],
              ['Documentation URL', documentationUrl],
              ['Primary Language', primaryLanguage],
              ['Runtime Platform', runtimePlatform],
              ['Auth Method', authenticationMethod],
              ['Internet Facing', internetFacing ? 'Yes' : undefined],
              ['Compliance Scope', complianceScope],
            ]} />
          )}

          {isDb && (
            <ReviewSection title="Database Extension" entries={[
              ['DB Engine', dbEngine],
              ['DB Version', dbVersion],
              ['Instance Name', instanceName],
              ['Port', dbPort],
              ['Backup Required', dbBackupRequired ? 'Yes' : undefined],
              ['Backup Frequency', backupFrequency],
              ['Encryption Enabled', encryptionEnabled ? 'Yes' : undefined],
              ['Contains Sensitive Data', containsSensitiveData ? 'Yes' : undefined],
            ]} />
          )}

          {isNetwork && (
            <ReviewSection title="Network Device Extension" entries={[
              ['Device Type', deviceType],
              ['Firmware Version', firmwareVersion],
              ['Management IP', managementIp],
              ['MAC Address', macAddress],
              ['Rack Location', rackLocation],
              ['HA Role', haRole],
            ]} />
          )}

          {isCloud && (
            <ReviewSection title="Cloud Resource Extension" entries={[
              ['Cloud Provider', cloudProvider],
              ['Region', region],
              ['Resource Group', resourceGroup],
              ['Resource Type', resourceType],
              ['Native Resource ID', nativeResourceId],
            ]} />
          )}

          {isDns && (
            <ReviewSection title="Endpoint / Certificate Extension" entries={[
              ['Endpoint Type', endpointType],
              ['Protocol', protocol],
              ['Port', port],
              ['URL', url],
              ['DNS Name', dnsName],
              ['Certificate Expiry', certificateExpiryDate],
              ['Certificate Issuer', certificateIssuer],
              ['TLS Required', tlsRequired ? 'Yes' : undefined],
            ]} />
          )}

          {isService && (
            <ReviewSection title="Service Extension" entries={[
              ['Service Type', serviceType],
              ['Service Tier', serviceTier],
              ['SLA Name', slaName],
              ['Availability Target', availabilityTarget ? `${availabilityTarget}%` : undefined],
              ['RTO (minutes)', rtoMinutes],
              ['RPO (minutes)', rpoMinutes],
            ]} />
          )}
        </div>
      </div>
    );
  }

  // ---- Main Render ----------------------------------------------------------

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <Link
          href="/dashboard/cmdb"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', textDecoration: 'none', fontSize: 14, marginBottom: 12 }}
        >
          <Icon path={mdiArrowLeft} size={0.8} color="currentColor" />
          Back to CMDB
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiPlus} size={1} color="var(--accent-primary)" />
          Create Configuration Item
        </h1>
      </div>

      {/* Step indicator */}
      {renderStepIndicator()}

      {/* Step content */}
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {step === 4 && renderStep4()}
      {step === 5 && renderStep5()}

      {/* Error */}
      {error && (
        <div style={{ marginTop: 16, padding: '10px 16px', backgroundColor: 'var(--badge-red-bg)', color: '#991b1b', borderRadius: 8, fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, gap: 12 }}>
        <button
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 20px',
            border: '1px solid var(--border-secondary)',
            borderRadius: 8,
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-secondary)',
            fontSize: 14,
            fontWeight: 500,
            cursor: step === 1 ? 'not-allowed' : 'pointer',
            opacity: step === 1 ? 0.5 : 1,
          }}
        >
          <Icon path={mdiArrowLeft} size={0.8} color="currentColor" />
          Back
        </button>

        {step < 5 ? (
          <button
            onClick={() => setStep((s) => Math.min(5, s + 1))}
            disabled={!canAdvance()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 20px',
              border: 'none',
              borderRadius: 8,
              backgroundColor: canAdvance() ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
              color: canAdvance() ? 'var(--bg-primary)' : 'var(--text-muted)',
              fontSize: 14,
              fontWeight: 600,
              cursor: canAdvance() ? 'pointer' : 'not-allowed',
            }}
          >
            Next
            <Icon path={mdiArrowRight} size={0.8} color="currentColor" />
          </button>
        ) : (
          <button
            onClick={() => void handleSubmit()}
            disabled={saving}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 24px',
              border: 'none',
              borderRadius: 8,
              backgroundColor: saving ? 'var(--bg-tertiary)' : 'var(--accent-primary)',
              color: saving ? 'var(--text-muted)' : 'var(--bg-primary)',
              fontSize: 14,
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            <Icon path={mdiCheck} size={0.8} color="currentColor" />
            {saving ? 'Creating...' : 'Create CI'}
          </button>
        )}
      </div>
    </div>
  );
}
