/**
 * Curated seed values merged into /api/v1/assets/suggest responses.
 *
 * DB values always win over seeds on case-insensitive duplicate.
 * Shape is authoritative; content can be extended freely.
 */

export const MANUFACTURER_SEEDS = [
  'Dell',
  'HP',
  'HPE',
  'Lenovo',
  'Apple',
  'Microsoft',
  'Cisco',
  'IBM',
  'Supermicro',
  'ASUS',
  'Acer',
  'Samsung',
  'Fujitsu',
  'VMware',
  'Oracle',
] as const;

export const MODEL_SEEDS: Record<string, string[]> = {
  Dell: [
    'Latitude',
    'OptiPlex',
    'Precision',
    'XPS',
    'PowerEdge R740',
    'PowerEdge R750',
    'PowerEdge R760',
    'PowerEdge T640',
  ],
  HP: ['EliteBook', 'ProBook', 'EliteDesk', 'ProDesk', 'LaserJet'],
  HPE: ['ProLiant DL380', 'ProLiant DL360', 'ProLiant ML350', 'Apollo 4200'],
  Lenovo: ['ThinkPad', 'ThinkCentre', 'ThinkStation', 'ThinkSystem SR650'],
  Apple: ['MacBook Pro', 'MacBook Air', 'Mac mini', 'iMac', 'Mac Pro', 'Mac Studio'],
  Microsoft: ['Surface Pro', 'Surface Laptop', 'Surface Book'],
  Cisco: ['Catalyst 9300', 'Catalyst 9200', 'Meraki MX', 'ASR 1000'],
  IBM: ['Power System S1014', 'Power System S1022'],
  Supermicro: ['SuperServer 1029', 'SuperServer 2029'],
};

export const OS_SEEDS = [
  'Windows 11',
  'Windows 10',
  'Windows Server 2022',
  'Windows Server 2019',
  'Windows Server 2016',
  'Ubuntu',
  'Debian',
  'Red Hat Enterprise Linux',
  'CentOS',
  'Rocky Linux',
  'AlmaLinux',
  'SUSE Linux Enterprise Server',
  'macOS',
  'VMware ESXi',
  'FreeBSD',
] as const;

export const OS_VERSION_SEEDS: Record<string, string[]> = {
  Ubuntu: ['24.04 LTS', '22.04 LTS', '20.04 LTS', '18.04 LTS'],
  Debian: ['12', '11', '10'],
  'Red Hat Enterprise Linux': ['9', '8', '7'],
  'Rocky Linux': ['9', '8'],
  AlmaLinux: ['9', '8'],
  'Windows 11': ['23H2', '22H2'],
  'Windows 10': ['22H2', '21H2'],
  'Windows Server 2022': ['21H2'],
  'Windows Server 2019': ['1809'],
  macOS: ['Sequoia 15', 'Sonoma 14', 'Ventura 13', 'Monterey 12', 'Big Sur 11'],
  'VMware ESXi': ['8.0', '7.0 U3', '7.0 U2'],
};

export const CPU_MODEL_SEEDS = [
  'Intel Xeon Gold 6248',
  'Intel Xeon Silver 4214',
  'Intel Xeon Platinum 8380',
  'Intel Core i9-13900',
  'Intel Core i7-13700',
  'Intel Core i7-12700',
  'Intel Core i5-13500',
  'Intel Core i5-12500',
  'AMD EPYC 7763',
  'AMD EPYC 9654',
  'AMD Ryzen 9 7950X',
  'AMD Ryzen 7 7700X',
  'Apple M2 Pro',
  'Apple M2 Max',
  'Apple M3 Pro',
  'Apple M3 Max',
] as const;
