require('dotenv').config();

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Orchestrator } from './orchestrator/Orchestrator';
import { Message } from './types/Message';
import * as readline from 'readline';
import chalk_default from 'chalk'; // Import chalk

const program = new Command();

// Define a color map for agents and human
const agentColors = new Map<string, typeof chalk_default>();
const colors = [chalk_default.hex('#FF5733'), chalk_default.hex('#33FF57'), chalk_default.hex('#3357FF'), chalk_default.hex('#FF33FF'), chalk_default.hex('#33FFFF'), chalk_default.hex('#FFFF33')];
let colorIndex = 0;

function getAgentColor(agentId: string): typeof chalk_default {
  if (!agentColors.has(agentId)) {
    agentColors.set(agentId, colors[colorIndex % colors.length]);
    colorIndex++;
  }
  return agentColors.get(agentId)!;
}

program
  .name('tokligence-works')
  .description('CLI for orchestrating AI agent teams')
  .version('0.0.1');

program.command('run')
  .description('Run a project with an AI agent team')
  .argument('<specFile>', 'Path to the project specification file (e.g., spec.md)')
  .option('-t, --team <teamFile>', 'Path to the team configuration file (default: team.yml)', 'team.yml')
  .action(async (specFile, options) => {
    console.log(chalk_default.bold.blue(`\n--- Tokligence Works CLI ---`));
    console.log(chalk_default.blue(`Running project with spec: ${specFile}`));
    console.log(chalk_default.blue(`Using team config: ${options.team}\n`));

    // Load team configuration
    const teamConfigPath = path.resolve(process.cwd(), options.team);
    if (!fs.existsSync(teamConfigPath)) {
      console.error(chalk_default.red(`Error: Team configuration file not found at ${teamConfigPath}`));
      process.exit(1);
    }
    const teamConfig = yaml.load(fs.readFileSync(teamConfigPath, 'utf8'));

    // Load project specification
    const projectSpecPath = path.resolve(process.cwd(), specFile);
    if (!fs.existsSync(projectSpecPath)) {
      console.error(chalk_default.red(`Error: Project specification file not found at ${projectSpecPath}`));
      process.exit(1);
    }
    const projectSpec = fs.readFileSync(projectSpecPath, 'utf8');

    const workspaceDir = process.cwd(); // Define workspace directory
    const orchestrator = new Orchestrator(teamConfig, projectSpec, workspaceDir); // Pass workspaceDir

    // Set up event listeners for real-time output
    orchestrator.on('message', (message: Message) => {
      const authorName = message.author.name;
      const authorRole = message.author.role;
      const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content, null, 2);

      let formattedAuthor: string;
      if (message.author.type === 'human') {
        formattedAuthor = chalk_default.bold.white(`You (${authorRole})`);
      } else if (message.author.id === 'system') {
        formattedAuthor = chalk_default.bold.magenta(`System (${authorRole})`);
      } else {
        formattedAuthor = getAgentColor(message.author.id)(`${authorName} (${authorRole})`);
      }
      console.log(`\n[${formattedAuthor}]: ${content}`);
    });

    orchestrator.on('agentThinking', ({ agentId, agentName, topicId }) => {
      const formattedAgentName = getAgentColor(agentId)(agentName);
      process.stdout.write(chalk_default.dim(`\n[${formattedAgentName} is thinking in topic: ${topicId}...`));
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

      let humanInputTimeout: NodeJS.Timeout | null = null;
      let countdownInterval: NodeJS.Timeout | null = null;
      let countdown = 3;

      const promptHuman = () => {
        if (countdownInterval) clearInterval(countdownInterval);
        countdown = 3;
        process.stdout.write('\r' + ' '.repeat(rl.line.length + rl.prompt.length) + '\r'); // Clear current line
        rl.prompt(true); // Display prompt
        
        countdownInterval = setInterval(() => {
          if (countdown > 0) {
            process.stdout.write(chalk_default.dim(`\r(Auto-continuing in ${countdown}s...)`));
            countdown--;
          } else {
            clearInterval(countdownInterval!); // Use non-null assertion operator
            humanInputTimeout = null; // Clear timeout reference
            process.stdout.write('\r' + ' '.repeat(rl.line.length + rl.prompt.length + 25) + '\r'); // Clear countdown
            console.log(chalk_default.dim('\n(No human input, auto-continuing...)'));
            // Trigger Orchestrator to continue, e.g., by prompting the Team Lead
            orchestrator.handleHumanInput('', 'general'); // Empty input to signal auto-continue
          }
        }, 1000);

        humanInputTimeout = setTimeout(() => {
          // This timeout is managed by the interval now
        }, 3000); // Initial timeout for 3 seconds
      };

      // Initial prompt after orchestrator initializes
      promptHuman();

      rl.on('line', async (line) => {
        if (humanInputTimeout) {
          clearTimeout(humanInputTimeout);
          humanInputTimeout = null;
        }
        if (countdownInterval) {
          clearInterval(countdownInterval);
          countdownInterval = null;
          process.stdout.write('\r' + ' '.repeat(rl.line.length + rl.prompt.length + 25) + '\r'); // Clear countdown
        }

        const input = line.trim();
        if (input.toLowerCase() === 'exit') {
          rl.close();
          return;
        }
        await orchestrator.handleHumanInput(input, 'general'); // For MVP, all human input goes to 'general' topic
        promptHuman(); // Prompt again after human input
      }).on('close', () => {
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