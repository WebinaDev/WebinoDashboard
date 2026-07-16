import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: 'category',
      label: 'Guides',
      collapsed: false,
      items: [
        'guides/getting-started',
        'guides/authentication',
        'guides/api-envelope',
      ],
    },
    {
      type: 'category',
      label: 'Architecture',
      collapsed: false,
      items: ['architecture/overview'],
    },
    {
      type: 'link',
      label: 'API Explorer (Redoc)',
      href: '/api/explorer/',
    },
  ],
};

export default sidebars;
