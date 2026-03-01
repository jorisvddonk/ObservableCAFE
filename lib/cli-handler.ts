import { Database, maskToken } from './database.js';

interface CliHandlerResult {
  handled: boolean;
}

function handleHelp(): CliHandlerResult {
  console.log(`
RXCAFE Chat Server

Usage:
  bun start                                          Start server
  bun start -- --help                                Show this help message

Client Management:
  bun start -- --generate-token [desc]              Generate new API token
  bun start -- --generate-token [desc] --admin      Generate admin API token
  bun start -- --trust <token> [desc]               Trust an API token
  bun start -- --list-clients                        List trusted API clients
  bun start -- --revoke <id>                         Revoke a trusted client
  bun start -- --token-admin <id>                    Toggle admin status for client

Telegram Users:
  bun start -- --trust-telegram <id|username> [desc]  Trust Telegram user
  bun start -- --untrust-telegram <id|username>       Untrust Telegram user
  bun start -- --list-telegram-users                   List trusted Telegram users

Environment Variables:
  PORT                       Server port (default: 3000)
  TELEGRAM_TOKEN             Telegram bot token
  TELEGRAM_WEBHOOK_URL       Telegram webhook URL
  TRUST_DB_PATH              Path to trust database
  KOBOLD_URL                 KoboldCPP base URL
  OLLAMA_URL                 Ollama base URL
  OLLAMA_MODEL               Ollama model name
  BACKEND                    Default backend (kobold or ollama)
`);
  process.exit(0);
}

function handleTrust(args: string[]): CliHandlerResult {
  const trustIndex = args.indexOf('--trust');
  if (trustIndex === -1 || !args[trustIndex + 1]) {
    return { handled: false };
  }

  const token = args[trustIndex + 1];
  const db = new Database();

  if (db.isTokenTrusted(token)) {
    console.log('❌ This token is already trusted');
    db.close();
    process.exit(1);
  }

  const description = args[trustIndex + 2] && !args[trustIndex + 2].startsWith('--')
    ? args[trustIndex + 2]
    : undefined;

  db.addClient(description);
  console.log('✅ Client trusted successfully');
  console.log(`Token: ${maskToken(token)}`);
  if (description) {
    console.log(`Description: ${description}`);
  }
  db.close();
  process.exit(0);
}

function handleGenerateToken(args: string[]): CliHandlerResult {
  if (!args.includes('--generate-token')) {
    return { handled: false };
  }

  const db = new Database();
  const isAdmin = args.includes('--admin');
  const description = args[args.indexOf('--generate-token') + 1] && !args[args.indexOf('--generate-token') + 1].startsWith('--')
    ? args[args.indexOf('--generate-token') + 1]
    : undefined;

  const token = db.addClientWithAdmin(description, isAdmin);
  console.log('✅ New client token generated and trusted');
  console.log(`Token: ${token}`);
  console.log('');
  console.log('Share this token with the client. They should use it as:');
  console.log('  - Authorization: Bearer <token> header');
  console.log('  - Or ?token=<token> query parameter');
  if (description) {
    console.log(`Description: ${description}`);
  }
  if (isAdmin) {
    console.log('Admin: YES - This token has administrative privileges');
  }
  db.close();
  process.exit(0);
}

function handleListClients(args: string[]): CliHandlerResult {
  if (!args.includes('--list-clients')) {
    return { handled: false };
  }

  const db = new Database();
  const clients = db.listClients();

  if (clients.length === 0) {
    console.log('No trusted clients found.');
  } else {
    console.log(`Trusted clients (${clients.length}):`);
    console.log('');
    console.log('ID  | Admin | Description          | Created            | Last Used          | Uses');
    console.log('----|-------|----------------------|--------------------|--------------------|------');

    for (const client of clients) {
      const admin = client.isAdmin ? '  ✓  ' : '     ';
      const desc = (client.description || '').slice(0, 20).padEnd(20);
      const created = new Date(client.createdAt).toLocaleString().slice(0, 18).padEnd(18);
      const lastUsed = client.lastUsedAt
        ? new Date(client.lastUsedAt).toLocaleString().slice(0, 18).padEnd(18)
        : 'Never'.padEnd(18);
      const uses = client.useCount.toString().padStart(5);

      console.log(`${client.id.toString().padStart(3)} | ${admin} | ${desc} | ${created} | ${lastUsed} | ${uses}`);
    }
  }

  db.close();
  process.exit(0);
}

function handleTokenAdmin(args: string[]): CliHandlerResult {
  const tokenAdminIndex = args.indexOf('--token-admin');
  if (tokenAdminIndex === -1 || !args[tokenAdminIndex + 1]) {
    return { handled: false };
  }

  const id = parseInt(args[tokenAdminIndex + 1]);
  if (isNaN(id)) {
    console.log('❌ Invalid client ID');
    process.exit(1);
  }

  const db = new Database();
  const client = db.getClientById(id);

  if (!client) {
    console.log(`❌ Client ${id} not found`);
    db.close();
    process.exit(1);
  }

  const newAdminStatus = !client.isAdmin;
  const success = db.setAdminStatus(id, newAdminStatus);

  if (success) {
    console.log(`✅ Client ${id} admin status: ${newAdminStatus ? 'ENABLED' : 'DISABLED'}`);
    if (client.description) {
      console.log(`Description: ${client.description}`);
    }
  } else {
    console.log(`❌ Failed to update client ${id}`);
  }

  db.close();
  process.exit(success ? 0 : 1);
}

function handleRevoke(args: string[]): CliHandlerResult {
  const revokeIndex = args.indexOf('--revoke');
  if (revokeIndex === -1 || !args[revokeIndex + 1]) {
    return { handled: false };
  }

  const id = parseInt(args[revokeIndex + 1]);
  if (isNaN(id)) {
    console.log('❌ Invalid client ID');
    process.exit(1);
  }

  const db = new Database();
  const success = db.removeClient(id);

  if (success) {
    console.log(`✅ Client ${id} revoked successfully`);
  } else {
    console.log(`❌ Client ${id} not found`);
  }

  db.close();
  process.exit(success ? 0 : 1);
}

function handleTrustTelegram(args: string[]): CliHandlerResult {
  const trustTelegramIndex = args.indexOf('--trust-telegram');
  if (trustTelegramIndex === -1 || !args[trustTelegramIndex + 1]) {
    return { handled: false };
  }

  const identifier = args[trustTelegramIndex + 1];
  const description = args[trustTelegramIndex + 2] && !args[trustTelegramIndex + 2].startsWith('--')
    ? args[trustTelegramIndex + 2]
    : undefined;

  const db = new Database();

  const userId = parseInt(identifier);
  if (!isNaN(userId)) {
    db.trustTelegramUser(userId, undefined, undefined, description);
    console.log(`✅ Trusted Telegram user ID: ${userId}`);
  } else {
    db.trustTelegramUsername(identifier, description);
    console.log(`✅ Trusted Telegram username: ${identifier}`);
  }

  if (description) {
    console.log(`Description: ${description}`);
  }

  db.close();
  process.exit(0);
}

function handleUntrustTelegram(args: string[]): CliHandlerResult {
  const untrustTelegramIndex = args.indexOf('--untrust-telegram');
  if (untrustTelegramIndex === -1 || !args[untrustTelegramIndex + 1]) {
    return { handled: false };
  }

  const identifier = args[untrustTelegramIndex + 1];
  const db = new Database();

  const userId = parseInt(identifier);
  let success: boolean;

  if (!isNaN(userId)) {
    success = db.untrustTelegramUser(userId);
    if (success) {
      console.log(`✅ Untrusted Telegram user ID: ${userId}`);
    } else {
      console.log(`❌ Telegram user ID ${userId} not found`);
    }
  } else {
    success = db.untrustTelegramUsername(identifier);
    if (success) {
      console.log(`✅ Untrusted Telegram username: ${identifier}`);
    } else {
      console.log(`❌ Telegram username ${identifier} not found`);
    }
  }

  db.close();
  process.exit(success ? 0 : 1);
}

function handleListTelegramUsers(args: string[]): CliHandlerResult {
  if (!args.includes('--list-telegram-users')) {
    return { handled: false };
  }

  const db = new Database();
  const users = db.listTrustedTelegramUsers();

  if (users.length === 0) {
    console.log('No trusted Telegram users found.');
  } else {
    console.log(`Trusted Telegram users (${users.length}):`);
    console.log('');
    console.log('ID  | User ID    | Username             | First Name           | Created            | Uses');
    console.log('----|------------|----------------------|----------------------|--------------------|------');

    for (const user of users) {
      const userId = (user.telegramUserId?.toString() || 'N/A').padEnd(10);
      const username = (user.username || 'N/A').padEnd(20);
      const firstName = (user.firstName || 'N/A').padEnd(20);
      const created = new Date(user.createdAt).toLocaleString().slice(0, 18).padEnd(18);
      const uses = user.useCount.toString().padStart(5);

      console.log(`${user.id.toString().padStart(3)} | ${userId} | ${username} | ${firstName} | ${created} | ${uses}`);
    }
  }

  db.close();
  process.exit(0);
}

export function handleCliCommands(args: string[]): void {
  if (args.includes('--help') || args.includes('-h')) {
    handleHelp();
  }

  handleTrust(args);
  handleGenerateToken(args);
  handleListClients(args);
  handleTokenAdmin(args);
  handleRevoke(args);
  handleTrustTelegram(args);
  handleUntrustTelegram(args);
  handleListTelegramUsers(args);
}
