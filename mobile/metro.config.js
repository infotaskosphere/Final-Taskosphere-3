const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

// 1. Get the default config
const config = getDefaultConfig(__dirname);

// 2. pnpm / Monorepo Support: 
// This ensures Metro looks in the correct symlinked locations for dependencies
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../.."); // Adjust if your 'mobile' folder is deeper

config.watchFolders = [projectRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// 3. Wrap with NativeWind
module.exports = withNativeWind(config, {
  input: "./global.css",
  // Fixed: forceWriteFileSystem is great for stability with pnpm/NativeWind v4
  forceWriteFileSystem: true,
});
