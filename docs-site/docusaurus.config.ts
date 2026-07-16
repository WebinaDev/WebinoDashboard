import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import { themes as prismThemes } from 'prism-react-renderer';

const config: Config = {
  title: 'Webino Dashboard',
  tagline: 'Multi-tenant storefront and admin API documentation',
  favicon: 'img/logo.svg',

  url: 'https://docs.dashboard.webina.example',
  baseUrl: '/',

  organizationName: 'webina',
  projectName: 'webino-dashboard',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'fa'],
    localeConfigs: {
      en: {
        label: 'English',
        direction: 'ltr',
        htmlLang: 'en-US',
      },
      fa: {
        label: 'فارسی',
        direction: 'rtl',
        htmlLang: 'fa-IR',
      },
    },
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
    [
      'redocusaurus',
      {
        specs: [
          {
            id: 'webino-dashboard-api',
            spec: 'openapi/openapi.json',
            route: '/api/explorer/',
          },
        ],
        theme: {
          primaryColor: '#2563eb',
        },
      },
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'Webino Dashboard',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          to: '/api/explorer/',
          label: 'API',
          position: 'left',
        },
        {
          type: 'localeDropdown',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Getting Started', to: '/guides/getting-started' },
            { label: 'Authentication', to: '/guides/authentication' },
            { label: 'API Envelope', to: '/guides/api-envelope' },
          ],
        },
        {
          title: 'API',
          items: [
            { label: 'API Explorer', to: '/api/explorer/' },
            { label: 'OpenAPI Spec', to: '/openapi/openapi.json' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Webina.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'php'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
