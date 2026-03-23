import { LinkingOptions } from '@react-navigation/native';

export const linking: LinkingOptions<ReactNavigation.RootParamList> = {
  prefixes: ['servicedesk://', 'https://meridian.example.com'],
  config: {
    screens: {
      DashboardTab: 'dashboard',
      TicketsTab: {
        screens: {
          TicketList: 'tickets',
          TicketDetail: 'tickets/:id',
          CreateTicket: 'tickets/new',
        },
      },
      KnowledgeTab: {
        screens: {
          KbList: 'knowledge',
          KbArticle: 'knowledge/:id',
        },
      },
      AssetsTab: {
        screens: {
          AssetList: 'assets',
          AssetDetail: 'assets/:id',
        },
      },
      ProfileTab: {
        screens: {
          Profile: 'profile',
          PushPreferences: 'profile/notifications',
        },
      },
    },
  },
};
