// Compat shim — moved to @meridian/notifications. Existing callers in this app
// kept their import paths, so re-export here. New code should import from
// '@meridian/notifications' directly.
export {
  evaluateCondition,
  evaluateConditionGroups,
  resolveFieldValue,
  renderTemplate,
} from '@meridian/notifications';
export type {
  Condition,
  ConditionGroup,
  EventContext,
} from '@meridian/notifications';
