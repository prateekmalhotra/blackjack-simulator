import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import os from 'os';

const authPath = path.join(os.homedir(), 'Library/Application Support/com.vercel.cli/auth.json');
const projPath = path.resolve('.vercel/project.json');

async function deploy() {
  if (!fs.existsSync(authPath)) {
    console.error('Vercel auth.json not found at:', authPath);
    process.exit(1);
  }
  const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
  const proj = JSON.parse(fs.readFileSync(projPath, 'utf8'));

  // 1. Automatically refresh OAuth token so it never expires
  if (auth.refreshToken) {
    const params = new URLSearchParams({
      client_id: 'cl_HYyOPBNtFMfHhaUn9L4QPfTZz6TP47bp',
      grant_type: 'refresh_token',
      refresh_token: auth.refreshToken,
    });
    const r = await fetch('https://api.vercel.com/login/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const tokenData = await r.json();
    if (tokenData.access_token) {
      auth.token = tokenData.access_token;
      if (tokenData.refresh_token) auth.refreshToken = tokenData.refresh_token;
      if (tokenData.expires_in) auth.expiresAt = Math.floor(Date.now() / 1000) + tokenData.expires_in;
      fs.writeFileSync(authPath, JSON.stringify(auth, null, 2));
    }
  }

  // 2. Collect all built files in dist/
  function getFiles(dir, prefix = '') {
    let results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) results.push(...getFiles(full, rel));
      else results.push({ full, rel });
    }
    return results;
  }

  const distFiles = getFiles('dist');
  const filePayloads = [];
  console.log(`Uploading ${distFiles.length} files from dist/ to Vercel...`);

  for (const f of distFiles) {
    const buf = fs.readFileSync(f.full);
    const sha = crypto.createHash('sha1').update(buf).digest('hex');
    await fetch(`https://api.vercel.com/v2/files?teamId=${proj.orgId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/octet-stream',
        'x-vercel-digest': sha,
        'Content-Length': String(buf.length),
      },
      body: buf,
    });
    filePayloads.push({ file: f.rel, sha, size: buf.length });
  }

  // 3. Create Production Deployment
  const depRes = await fetch(`https://api.vercel.com/v13/deployments?teamId=${proj.orgId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'blackjack',
      project: proj.projectId,
      target: 'production',
      files: filePayloads,
      projectSettings: { framework: null, buildCommand: '', outputDirectory: '' },
    }),
  });

  const dep = await depRes.json();
  console.log(`Deployment created: ${dep.id} (${dep.readyState})`);

  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const st = await (
      await fetch(`https://api.vercel.com/v13/deployments/${dep.id}?teamId=${proj.orgId}`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      })
    ).json();
    if (st.readyState === 'READY') {
      console.log(`✅ Live on Production: https://blackjack-theta-beryl.vercel.app`);
      return;
    }
    if (st.readyState === 'ERROR') {
      console.error('❌ Deployment failed:', st.errorMessage);
      process.exit(1);
    }
  }
}

deploy();
