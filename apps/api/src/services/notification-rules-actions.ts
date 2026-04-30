// Compat shim — moved to @meridian/notifications. Existing callers in this app
// kept their import paths, so re-export here. New code should import from
// '@meridian/notifications' directly.
export {
  executeActions,
  resolveTemplate,
} from '@meridian/notifications';
export type {
  ActionConfig,
  ActionResult,
  TemplateChannel,
} from '@meridian/notifications';
