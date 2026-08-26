import React from 'react';
import {render as inkRender, type RenderOptions} from 'ink';
import {App, type AppProps} from './App.js';

export interface TuiOptions extends Omit<AppProps, 'terminalWidth'> {
  render?: (node: React.ReactNode, options: RenderOptions) => {waitUntilExit: () => Promise<unknown>};
}

export async function runTui(options: TuiOptions = {}): Promise<void> {
  const {render = inkRender, onForceExit = () => process.exit(130), ...appOptions} = options;
  const instance = render(<App {...appOptions} onForceExit={onForceExit}/>, {
    alternateScreen: true,
    exitOnCtrlC: false,
  });
  await instance.waitUntilExit();
}
