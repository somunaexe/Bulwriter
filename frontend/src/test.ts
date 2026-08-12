// Karma test entry point. The Angular CLI's karma builder can synthesize
// this itself (a virtual base64 data-URI module) when no `main` is
// configured, but that synthetic module confuses the Ivy webpack plugin's
// TypeScript program ("is missing from the TypeScript compilation") on
// this Angular/TypeScript version combo — a real file sidesteps it.
import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting(), {
  errorOnUnknownElements: true,
  errorOnUnknownProperties: true,
});
