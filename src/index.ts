#!/usr/bin/env node

import { Command } from 'commander';
import * as dotenv from 'dotenv';
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
    // Load environment variables from .tokligence/.env or .env
    const tokligenceEnvPath = path.join(process.cwd(), '.tokligence', '.env');
    const defaultEnvPath = path.join(process.cwd(), '.env');

    if (fs.existsSync(tokligenceEnvPath)) {
      dotenv.config({ path: tokligenceEnvPath });
    } else if (fs.existsSync(defaultEnvPath)) {
      dotenv.config({ path: defaultEnvPath });
    }

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

program.command('start')
  .description('Start the project (shortcut for "run SPEC.md")')
  .option('-t, --team <teamFile>', 'Path to the team configuration file (default: tokligence.yml)', 'tokligence.yml')
  .action(async (options) => {
    const specFile = 'SPEC.md';
    const specPath = path.join(process.cwd(), specFile);

    if (!fs.existsSync(specPath)) {
      console.error(chalk_default.red(`Error: ${specFile} not found in current directory.`));
      console.error(chalk_default.yellow(`Hint: Run 'tokligence init' to create a new project.`));
      process.exit(1);
    }

    // Load environment variables from .tokligence/.env or .env
    const tokligenceEnvPath = path.join(process.cwd(), '.tokligence', '.env');
    const defaultEnvPath = path.join(process.cwd(), '.env');

    if (fs.existsSync(tokligenceEnvPath)) {
      dotenv.config({ path: tokligenceEnvPath });
    } else if (fs.existsSync(defaultEnvPath)) {
      dotenv.config({ path: defaultEnvPath });
    }

    console.log(chalk_default.bold.blue(`\n--- Tokligence Works CLI ---`));
    console.log(chalk_default.blue(`Running project with spec: ${specFile}`));
    console.log(chalk_default.blue(`Using team config: ${options.team}\n`));

    const teamConfigPath = path.resolve(process.cwd(), options.team);
    if (!fs.existsSync(teamConfigPath)) {
      console.error(chalk_default.red(`Error: Team configuration file not found at ${teamConfigPath}`));
      process.exit(1);
    }
    const teamConfig = yaml.load(fs.readFileSync(teamConfigPath, 'utf8'));
    const projectSpec = fs.readFileSync(specPath, 'utf8');
    const workspaceDir = process.cwd();
    const orchestrator = new Orchestrator(teamConfig, projectSpec, workspaceDir);

    // Use same event handlers and logic as 'run' command
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

program.command('init')
  .description('Initialize a new Tokligence project in the current directory')
  .option('-f, --force', 'Overwrite existing files', false)
  .action(async (options) => {
    console.log(chalk_default.bold.blue('\n--- Initializing Tokligence Project ---\n'));

    const cwd = process.cwd();
    const templatesDir = path.join(__dirname, '..', 'templates');

    // Check if templates directory exists
    if (!fs.existsSync(templatesDir)) {
      console.error(chalk_default.red(`Error: Templates directory not found at ${templatesDir}`));
      console.error(chalk_default.red('Please ensure tokligence-works is properly installed.'));
      process.exit(1);
    }

    // Files to copy
    const filesToCopy = [
      { src: 'tokligence.yml.template', dest: 'tokligence.yml' },
      { src: 'SPEC.md.template', dest: 'SPEC.md' },
      { src: '.env.template', dest: '.env' },
      { src: 'tokligence.gitignore', dest: '.gitignore' }
    ];

    let copiedCount = 0;
    let skippedCount = 0;

    for (const file of filesToCopy) {
      const srcPath = path.join(templatesDir, file.src);
      const destPath = path.join(cwd, file.dest);

      if (!fs.existsSync(srcPath)) {
        console.warn(chalk_default.yellow(`⚠ Template file not found: ${file.src}`));
        continue;
      }

      if (fs.existsSync(destPath) && !options.force) {
        console.log(chalk_default.dim(`⊘ Skipped ${file.dest} (already exists)`));
        skippedCount++;
        continue;
      }

      try {
        fs.copyFileSync(srcPath, destPath);
        console.log(chalk_default.green(`✓ Created ${file.dest}`));
        copiedCount++;
      } catch (error) {
        console.error(chalk_default.red(`✗ Failed to create ${file.dest}: ${error}`));
      }
    }

    console.log(chalk_default.bold.blue(`\n--- Initialization Complete ---`));
    console.log(chalk_default.green(`Created ${copiedCount} file(s)`));
    if (skippedCount > 0) {
      console.log(chalk_default.dim(`Skipped ${skippedCount} file(s) (use --force to overwrite)`));
    }

    console.log(chalk_default.bold.white('\nNext steps:'));
    console.log(chalk_default.white('1. Edit .env and add your API keys'));
    console.log(chalk_default.white('2. Customize tokligence.yml with your team configuration'));
    console.log(chalk_default.white('3. Write your project requirements in SPEC.md'));
    console.log(chalk_default.white('4. Run: tokligence run SPEC.md\n'));
  });

program.command('validate')
  .description('Validate project configuration files')
  .option('-t, --team <teamFile>', 'Path to the team configuration file (default: tokligence.yml)', 'tokligence.yml')
  .action((options) => {
    console.log(chalk_default.bold.blue('\n--- Validating Configuration ---\n'));

    let errorCount = 0;
    let warningCount = 0;

    // Check team config
    const teamConfigPath = path.resolve(process.cwd(), options.team);
    if (!fs.existsSync(teamConfigPath)) {
      console.log(chalk_default.red(`✗ Team config not found: ${teamConfigPath}`));
      errorCount++;
    } else {
      try {
        const teamConfig: any = yaml.load(fs.readFileSync(teamConfigPath, 'utf8'));
        console.log(chalk_default.green(`✓ Team config found: ${teamConfigPath}`));

        if (!teamConfig.members || teamConfig.members.length === 0) {
          console.log(chalk_default.red('  ✗ No team members defined'));
          errorCount++;
        } else {
          console.log(chalk_default.green(`  ✓ ${teamConfig.members.length} team member(s) defined`));
        }
      } catch (error) {
        console.log(chalk_default.red(`✗ Invalid YAML in team config: ${error}`));
        errorCount++;
      }
    }

    // Check SPEC.md
    const specPath = path.join(process.cwd(), 'SPEC.md');
    if (!fs.existsSync(specPath)) {
      console.log(chalk_default.yellow(`⚠ SPEC.md not found (optional)`));
      warningCount++;
    } else {
      console.log(chalk_default.green(`✓ SPEC.md found`));
    }

    // Check .env
    const envPaths = [
      path.join(process.cwd(), '.tokligence', '.env'),
      path.join(process.cwd(), '.env')
    ];

    let envFound = false;
    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        console.log(chalk_default.green(`✓ Environment file found: ${envPath}`));
        envFound = true;

        // Check for required API keys
        const envContent = fs.readFileSync(envPath, 'utf8');
        const hasOpenAI = /OPENAI_API_KEY=.+/.test(envContent);
        const hasAnthropic = /ANTHROPIC_API_KEY=.+/.test(envContent);
        const hasGoogle = /GOOGLE_API_KEY=.+/.test(envContent);

        if (!hasOpenAI && !hasAnthropic && !hasGoogle) {
          console.log(chalk_default.yellow('  ⚠ No API keys configured (at least one required)'));
          warningCount++;
        } else {
          const configured = [];
          if (hasOpenAI) configured.push('OpenAI');
          if (hasAnthropic) configured.push('Anthropic');
          if (hasGoogle) configured.push('Google');
          console.log(chalk_default.green(`  ✓ API keys configured: ${configured.join(', ')}`));
        }
        break;
      }
    }

    if (!envFound) {
      console.log(chalk_default.yellow(`⚠ No .env file found`));
      warningCount++;
    }

    // Summary
    console.log(chalk_default.bold.blue('\n--- Validation Summary ---'));
    if (errorCount === 0 && warningCount === 0) {
      console.log(chalk_default.green('✓ All checks passed!'));
      console.log(chalk_default.white('You can run: tokligence start\n'));
    } else {
      if (errorCount > 0) {
        console.log(chalk_default.red(`✗ ${errorCount} error(s) found`));
      }
      if (warningCount > 0) {
        console.log(chalk_default.yellow(`⚠ ${warningCount} warning(s) found`));
      }
      console.log();
    }
  });

program.parse(process.argv);
