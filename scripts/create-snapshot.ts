#!/usr/bin/env node

import { Daytona, Image } from '@daytonaio/sdk';
import { readFileSync } from 'fs';
import { join } from 'path';

const CLAUDE_SNAPSHOT_NAME = "claude-code-bugfixer:1.0.0";

async function createSnapshot(): Promise<void> {
  try {
    // Check if .env exists and has DAYTONA_API_KEY
    let daytonaApiKey: string | undefined;
    try {
      const envPath = join(process.cwd(), '.env');
      const envVars = readFileSync(envPath, 'utf8');
      const match = envVars.match(/DAYTONA_API_KEY=(.+)/);
      daytonaApiKey = match?.[1]?.trim();
    } catch (error) {
      console.error('Error reading .env file:', (error as Error).message);
      console.error('Please create a .env file with DAYTONA_API_KEY');
      process.exit(1);
    }

    if (!daytonaApiKey) {
      console.error('DAYTONA_API_KEY not found in .env');
      process.exit(1);
    }

    console.log('Initializing Daytona client...');
    const daytona = new Daytona({ apiKey: daytonaApiKey });

    console.log('Creating Claude Code snapshot from Dockerfile...');
    const dockerfilePath = join(process.cwd(), 'Dockerfile');
    const claudeImage = Image.fromDockerfile(dockerfilePath);

    await daytona.snapshot.create(
      {
        name: CLAUDE_SNAPSHOT_NAME,
        image: claudeImage,
      },
      {
        onLogs: (chunk: string) => console.log(chunk),
      }
    );

    console.log(`✅ Snapshot "${CLAUDE_SNAPSHOT_NAME}" created successfully!`);
    console.log(`You can now use this snapshot when creating AFTER sandboxes.`);
  } catch (error) {
    console.error('❌ Failed to create snapshot:', (error as Error).message);
    process.exit(1);
  }
}

createSnapshot();

