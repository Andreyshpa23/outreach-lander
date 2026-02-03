#!/usr/bin/env node

/**
 * Script to temporarily pause a Vercel project
 * Usage: node scripts/pause-vercel-project.mjs [projectName] [vercelToken]
 * 
 * Or set environment variables:
 * - VERCEL_TOKEN (your Vercel API token)
 * - VERCEL_PROJECT_NAME (project name, default: outreach-lander)
 */

const projectName = process.argv[2] || process.env.VERCEL_PROJECT_NAME || 'outreach-lander';
const token = process.argv[3] || process.env.VERCEL_TOKEN;

if (!token) {
  console.error('❌ Error: Vercel token is required');
  console.log('\nUsage:');
  console.log('  node scripts/pause-vercel-project.mjs [projectName] [token]');
  console.log('\nOr set environment variables:');
  console.log('  export VERCEL_TOKEN=your_token');
  console.log('  export VERCEL_PROJECT_NAME=outreach-lander');
  console.log('  node scripts/pause-vercel-project.mjs');
  console.log('\nTo get your token:');
  console.log('  1. Go to https://vercel.com/account/tokens');
  console.log('  2. Create a new token');
  process.exit(1);
}

async function pauseProject() {
  try {
    // First, get project ID
    console.log(`🔍 Looking for project: ${projectName}...`);
    
    const listResponse = await fetch('https://api.vercel.com/v9/projects', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!listResponse.ok) {
      const error = await listResponse.text();
      throw new Error(`Failed to list projects: ${listResponse.status} ${error}`);
    }

    const projects = await listResponse.json();
    const project = projects.projects?.find(p => p.name === projectName);

    if (!project) {
      console.error(`❌ Project "${projectName}" not found`);
      console.log('\nAvailable projects:');
      projects.projects?.forEach(p => console.log(`  - ${p.name} (${p.id})`));
      process.exit(1);
    }

    console.log(`✅ Found project: ${project.name} (${project.id})`);

    // Pause the project
    console.log(`⏸️  Pausing project...`);
    
    const pauseResponse = await fetch(
      `https://api.vercel.com/v1/projects/${project.id}/pause`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!pauseResponse.ok) {
      const error = await pauseResponse.text();
      throw new Error(`Failed to pause project: ${pauseResponse.status} ${error}`);
    }

    const result = await pauseResponse.json();
    console.log(`✅ Project paused successfully!`);
    console.log(`\nTo unpause, go to: https://vercel.com/${project.accountId}/${project.name}/settings`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

pauseProject();
