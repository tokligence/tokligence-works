import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ToolService } from './ToolManager';

const createdWorkspaces: string[] = [];

function createTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tokligence-workspace-'));
  createdWorkspaces.push(dir);
  return dir;
}

afterAll(() => {
  createdWorkspaces.forEach((dir) => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      // ignore cleanup errors
    }
  });
});

describe('ToolService', () => {
  it('writes files and creates missing directories', async () => {
    const workspace = createTempWorkspace();
    const service = new ToolService(workspace);
    const result = await service.executeTool('file_system', { action: 'write', path: 'nested/output.txt', content: 'hello' }, { sandboxLevel: 'guided' });
    expect(result.success).toBe(true);
    const written = fs.readFileSync(path.join(workspace, 'nested/output.txt'), 'utf8');
    expect(written).toBe('hello');
  });

  it('blocks chained commands in strict mode', async () => {
    const workspace = createTempWorkspace();
    const service = new ToolService(workspace);
    const result = await service.executeTool('terminal', { command: 'ls && pwd' }, { sandboxLevel: 'strict' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Strict sandbox');
  });

  it('executes safe commands in guided mode', async () => {
    const workspace = createTempWorkspace();
    const service = new ToolService(workspace);
    const result = await service.executeTool('terminal', { command: 'pwd' }, { sandboxLevel: 'guided' });
    expect(result.success).toBe(true);
    const resolvedOutput = result.output.trim();
    expect(resolvedOutput).toBeTruthy();
    expect(fs.realpathSync(resolvedOutput)).toBe(fs.realpathSync(workspace));
  });
});
