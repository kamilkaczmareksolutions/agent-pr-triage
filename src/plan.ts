import { COMMENT_MARKER, type Decision, type Policy, type RepoState, type UpdatePlan } from './types.ts';

export function planUpdates(state: RepoState, decision: Decision, policy: Policy): UpdatePlan {
  const managed = new Set([policy.labelNeedsReview, policy.labelSkimOk]);
  const markerComments = state.comments.filter((comment) => comment.body.includes(COMMENT_MARKER));

  if (decision.outcome === 'skip') {
    return {
      addLabels: [],
      removeLabels: state.labels.filter((label) => managed.has(label)),
      createComment: null,
      updateComment: null,
      deleteCommentIds: markerComments.map((comment) => comment.id),
    };
  }

  const desired = decision.label;
  const [first, ...rest] = markerComments;
  return {
    addLabels: state.labels.includes(desired) ? [] : [desired],
    removeLabels: state.labels.filter((label) => managed.has(label) && label !== desired),
    createComment: first === undefined ? decision.comment : null,
    updateComment: first !== undefined && first.body !== decision.comment ? { id: first.id, body: decision.comment } : null,
    deleteCommentIds: rest.map((comment) => comment.id),
  };
}

export function planIsEmpty(plan: UpdatePlan): boolean {
  return (
    plan.addLabels.length === 0 &&
    plan.removeLabels.length === 0 &&
    plan.createComment === null &&
    plan.updateComment === null &&
    plan.deleteCommentIds.length === 0
  );
}
