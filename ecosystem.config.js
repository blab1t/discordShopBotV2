module.exports = {
  apps: [
    {
      name: 'shopbot-v2',
      script: 'src/index.js',
      interpreter: '/opt/node18/bin/node',
      restart_delay: 5000,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        ENV_FILE: '.env.server1',
      },
    },
    {
      name: 'shopbot-v2-server2',
      script: 'src/index.js',
      interpreter: '/opt/node18/bin/node',
      restart_delay: 5000,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        ENV_FILE: '.env.server2',
      },
    },
    {
      name: 'shopbot-v2-server3',
      script: 'src/index.js',
      interpreter: '/opt/node18/bin/node',
      restart_delay: 5000,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        ENV_FILE: '.env.server3',
      },
    },
    {
      name: 'shopbot-v2-server4',
      script: 'src/index.js',
      interpreter: '/opt/node18/bin/node',
      restart_delay: 5000,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        ENV_FILE: '.env.server4',
      },
    },
  ],
};
