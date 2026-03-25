const fs = require('fs');
const path = require('path');

const pluginDir = path.resolve(__dirname, '..');
const marketplaceDir = path.resolve(pluginDir, '../citadel-marketplace/plugins/citadel-plugin-youtube');

console.log('[Marketplace Generator] Starting generation...');

// 1. Ensure marketplace directories exist
if (!fs.existsSync(marketplaceDir)) {
    fs.mkdirSync(marketplaceDir, { recursive: true });
}

// 2. Read plugin README.md
const readmePath = path.join(pluginDir, 'README.md');
if (fs.existsSync(readmePath)) {
    const readme = fs.readFileSync(readmePath, 'utf8');
    fs.writeFileSync(path.join(marketplaceDir, 'README.md'), readme);
    console.log('[Marketplace Generator] Successfully copied README.md');
} else {
    console.warn('[Marketplace Generator] Warning: No README.md found in plugin repository.');
}

// 3. Extract IPC capabilities and permissions from typescript AST/Code
const rendererIndex = path.join(pluginDir, 'src/renderer/index.ts');
let ipcs = [];
let permissions = [];

if (fs.existsSync(rendererIndex)) {
    const code = fs.readFileSync(rendererIndex, 'utf8');
    
    // Parse 'ipcs' block
    const ipcsMatch = code.match(/ipcs:\s*\[([\s\S]*?)\]/);
    if (ipcsMatch) {
         ipcs = ipcsMatch[1].split(',')
            .map(s => s.trim().replace(/['"]/g, ''))
            .filter(Boolean);
    }

    // Parse 'permissions.ipc' block
    const permsMatch = code.match(/ipc:\s*\[([\s\S]*?)\]/);
    if (permsMatch) {
        permissions = permsMatch[1].split(',')
            .map(s => s.trim().replace(/['"]/g, ''))
            .filter(Boolean);
    }
} else {
    console.warn('[Marketplace Generator] Warning: src/renderer/index.ts not found. Cannot extract metadata.');
}

// 4. Update or construct marketplace package.json
const sourcePkgPath = path.join(pluginDir, 'package.json');
const destPkgPath = path.join(marketplaceDir, 'package.json');

// Get base metadata either from source pkg or dest pkg
let metaPkg = {};
if (fs.existsSync(destPkgPath)) {
    metaPkg = JSON.parse(fs.readFileSync(destPkgPath, 'utf8'));
} else if (fs.existsSync(sourcePkgPath)) {
    metaPkg = JSON.parse(fs.readFileSync(sourcePkgPath, 'utf8'));
}

const sourcePkg = JSON.parse(fs.readFileSync(sourcePkgPath, 'utf8'));

// Ensure citadel object exists
metaPkg.citadel = metaPkg.citadel || {};
metaPkg.citadel.capabilities = ipcs;
metaPkg.citadel.permissions = permissions;

// Pull additional metadata from the plugin's package.json citadel property
if (sourcePkg.citadel) {
    if (sourcePkg.citadel.title) metaPkg.citadel.title = sourcePkg.citadel.title;
    if (sourcePkg.citadel.icon) {
        metaPkg.citadel.icon = sourcePkg.citadel.icon;
        
        // Physically copy the icon file into the marketplace directory so it can be hosted on GitHub raw
        const iconSrcPath = path.join(pluginDir, sourcePkg.citadel.icon);
        const iconDestPath = path.join(marketplaceDir, sourcePkg.citadel.icon);
        if (fs.existsSync(iconSrcPath)) {
            const iconDestDir = path.dirname(iconDestPath);
            if (!fs.existsSync(iconDestDir)) fs.mkdirSync(iconDestDir, { recursive: true });
            fs.copyFileSync(iconSrcPath, iconDestPath);
            console.log(`[Marketplace Generator] Copied plugin icon: ${sourcePkg.citadel.icon}`);
        }
    }
}

fs.writeFileSync(destPkgPath, JSON.stringify(metaPkg, null, 2));

console.log('[Marketplace Generator] Updated package.json metadata:');
console.log('  Capabilities (Owned IPCs):', ipcs);
console.log('  Required Permissions:', permissions);

// 5. Update versions.json if a new version is introduced
const versionPath = path.join(marketplaceDir, 'versions.json');
let versionsData = { latest: metaPkg.version, versions: {} };

if (fs.existsSync(versionPath)) {
    versionsData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
}

const currentVersion = metaPkg.version;
if (!versionsData.versions[currentVersion]) {
    versionsData.latest = currentVersion;
    
    const bundleUrl = metaPkg.citadel?.bundleUrl || `https://github.com/citadel-app/${metaPkg.name}/releases/download/v${currentVersion}/${metaPkg.name}.zip`;
    const citadelVersionRange = metaPkg.engines?.citadel || ">=1.0.0";
    
    versionsData.versions[currentVersion] = {
        bundleUrl,
        releasedAt: new Date().toISOString(),
        changelog: `Release v${currentVersion}`,
        citadelVersionRange
    };
    
    fs.writeFileSync(versionPath, JSON.stringify(versionsData, null, 2));
    console.log(`[Marketplace Generator] Added new version ${currentVersion} to versions.json!`);
} else {
    console.log(`[Marketplace Generator] Version ${currentVersion} already exists in versions.json - skipping append.`);
}

console.log('[Marketplace Generator] Generation Complete!');
