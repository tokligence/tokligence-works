require('dotenv').config();

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Orchestrator } from './orchestrator/Orchestrator';
import { Message } from './types/Message';
import * as readline from 'readline';
import chalk_default from 'chalk';

const program = new Command();

const roleColors: Record<string, typeof chalk_default> = {
  system: chalk_default.hex('#A020F0'),
  human: chalk_default.white,
  lead: chalk_default.hex('#FF8C00'),
  qa: chalk_default.hex('#32CD32'),
  backend: chalk_default.hex('#1E90FF'),
  default: chalk_default.hex('#FFD700'),
};

function getAgentColor(author: { id: string; role: string; type: 'agent' | 'human' }): typeof chalk_default {
  if (author.type === 'human') {
    return roleColors.human;
  }
  if (author.id === 'system') {
    return roleColors.system;
  }
  const role = (author.role || '').toLowerCase();
  if (role.includes('team lead')) {
    return roleColors.lead;
  }
  if (role.includes('qa') || role.includes('frontend')) {
    return roleColors.qa;
  }
  if (role.includes('backend')) {
    return roleColors.backend;
  }
  return roleColors.default;
}

program
  .name('tokligence-works')
  .description('CLI for orchestrating AI agent teams')
  .version('0.1.0');

program.command('run')
  .description('Run a project with an AI agent team')
  .argument('<specFile>', 'Path to the project specification file (e.g., spec.md)')
  .option('-t, --team <teamFile>', 'Path to the team configuration file (default: team.yml)', 'team.yml')
  .action(async (specFile, options) => {
    console.log(chalk_default.bold.blue(`\n--- Tokligence Works CLI ---`));
    console.log(chalk_default.blue(`Running project with spec: ${specFile}`));
    console.log(chalk_default.blue(`Using team config: ${options.team}\n`));

    const teamConfigPath = path.resolve(process.cwd(), options.team);
    if (!fs.existsSync(teamConfigPath)) {
      console.error(chalk_default.red(`Error: Team configuration file not found at ${teamConfigPath}`));
      process.exit(1);
    }
    const teamConfig = yaml.load(fs.readFileSync(teamConfigPath, 'utf8'));

    const projectSpecPath = path.resolve(process.cwd(), specFile);
    if (!fs.existsSync(projectSpecPath)) {
      console.error(chalk_default.red(`Error: Project specification file not found at ${projectSpecPath}`));
      process.exit(1);
    }
    const projectSpec = fs.readFileSync(projectSpecPath, 'utf8');

    const workspaceDir = process.cwd();
    const orchestrator = new Orchestrator(teamConfig, projectSpec, workspaceDir);

    orchestrator.on('message', (message: Message) => {
      const authorName = message.author.name;
      const authorRole = message.author.role;
      const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content, null, 2);

      let formattedAuthor: string;
      let coloredContent: string;

      const colorizer = getAgentColor(message.author);
      if (message.author.type === 'human') {
        formattedAuthor = colorizer.bold(`You (${authorRole})`);
      } else if (message.author.id === 'system') {
        formattedAuthor = colorizer.bold(`System (${authorRole})`);
      } else {
        formattedAuthor = colorizer.bold(`${authorName} (${authorRole})`);
      }
      coloredContent = colorizer(content);
      console.log(`\n[${formattedAuthor}]: ${coloredContent}`);
    });

    orchestrator.on('agentThinking', ({ agentId, agentName, topicId }) => {
      const formattedAgentName = getAgentColor(agentId)(agentName);
      process.stdout.write(chalk_default.dim(`\n[${formattedAgentName} is thinking in topic: ${topicId}...]`));
    });

    orchestrator.on('toolCalling', ({ agentId, agentName, toolName, args }) => {
      const formattedAgentName = getAgentColor(agentId)(agentName);
      process.stdout.write(chalk_default.dim(`\n[${formattedAgentName} is calling tool: ${toolName} with args: ${JSON.stringify(args)}]`));
    });

    try {
      await orchestrator.initialize();

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: chalk_default.bold.white('You: '),
      });

      let awaitingInput = false;
      let countdownInterval: NodeJS.Timeout | null = null;
      let autoContinueTimer: NodeJS.Timeout | null = null;
      let countdown = 3;
      let autoTriggered = false;

      const clearTimers = () => {
        if (countdownInterval) {
          clearInterval(countdownInterval);
          countdownInterval = null;
        }
        if (autoContinueTimer) {
          clearTimeout(autoContinueTimer);
          autoContinueTimer = null;
        }
      };

     const promptHuman = () => {
        awaitingInput = true;
        autoTriggered = false;
        clearTimers();
        countdown = 3;
        rl.prompt(true);

        countdownInterval = setInterval(() => {
          if (!awaitingInput) {
            return;
          }
          if (orchestrator.requiresHumanInput()) {
            process.stdout.write(chalk_default.yellow(`\r(Human input required, auto-continue paused)   `));
            return;
          }
          if (!orchestrator.hasPendingTasks()) {
            return;
          }
          if (countdown > 0) {
            process.stdout.write(chalk_default.dim(`\r(Auto-continuing in ${countdown}s...)   `));
            countdown--;
          }
        }, 1000);

        autoContinueTimer = setTimeout(() => {
          if (!awaitingInput || autoTriggered) {
            return;
          }
          if (orchestrator.requiresHumanInput()) {
            if (countdownInterval) {
              clearInterval(countdownInterval);
              countdownInterval = null;
            }
            process.stdout.write('\r' + ' '.repeat(rl.line.length + rl.prompt.length + 30) + '\r');
            console.log(chalk_default.yellow('\n(Human input required. Waiting for your instructions.)'));
            autoTriggered = true;
            return;
          }
          if (!orchestrator.hasPendingTasks()) {
            if (countdownInterval) {
              clearInterval(countdownInterval);
              countdownInterval = null;
            }
            process.stdout.write('\r' + ' '.repeat(rl.line.length + rl.prompt.length + 25) + '\r');
            console.log(chalk_default.dim('\n(No pending tasks. Session idle.)'));
            autoTriggered = true;
            return;
          }
          autoTriggered = true;
          awaitingInput = false;
          if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
          }
          process.stdout.write('\r' + ' '.repeat(rl.line.length + rl.prompt.length + 25) + '\r');
          console.log(chalk_default.dim('\n(No human input, agents will continue autonomously...)'));
        }, 3000);
      };

      promptHuman();

      rl.on('line', async (line) => {
        awaitingInput = false;
        autoTriggered = true;
        clearTimers();
        process.stdout.write('\r' + ' '.repeat(rl.line.length + rl.prompt.length + 25) + '\r');

        const input = line.trim();
        if (input.toLowerCase() === 'exit') {
          rl.close();
          return;
        }
        await orchestrator.handleHumanInput(input, 'general');
        promptHuman();
      }).on('close', () => {
        clearTimers();
        console.log(chalk_default.bold.blue('\n--- Tokligence Works CLI Exited ---'));
        process.exit(0);
      });
    } catch (error) {
      console.error(chalk_default.red('\n--- Orchestrator Error ---'));
      console.error(chalk_default.red(error));
      process.exit(1);
    }
  });

program.parse(process.argv);
