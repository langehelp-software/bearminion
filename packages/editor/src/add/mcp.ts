import path from 'node:path'

/** The one package the MCP server needs. The range is the editor's own optional peer range, and a test keeps them equal. */
export const MCP_SDK: Record<string, string> = { '@modelcontextprotocol/sdk': '^1.32.2' }

/** The entry an MCP client's config file takes for this site. The folder is absolute: a desktop app does not start in the project. */
export function mcpClientConfig(root: string): string {
  return JSON.stringify(
    { mcpServers: { bearminion: { command: 'npx', args: ['bearminion', 'mcp', '--cwd', path.resolve(root)] } } },
    null,
    2,
  )
}
