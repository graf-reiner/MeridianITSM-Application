export type AuthStackParamList = {
  Login: undefined;
  QrScan: undefined;
  ManualServer: undefined;
};

export type AppTabsParamList = {
  DashboardTab: undefined;
  TicketsTab: undefined;
  KnowledgeTab: undefined;
  AssetsTab: undefined;
  ProfileTab: undefined;
};

export type TicketsStackParamList = {
  TicketList: undefined;
  TicketDetail: { id: string };
  CreateTicket: undefined;
};

export type KnowledgeStackParamList = {
  KbList: undefined;
  KbArticle: { id: string };
};

export type AssetsStackParamList = {
  AssetList: undefined;
  AssetDetail: { id: string };
};

export type ProfileStackParamList = {
  Profile: undefined;
  PushPreferences: undefined;
};
