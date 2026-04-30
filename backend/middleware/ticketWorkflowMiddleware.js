import { getTicketPauseMetadata } from '../services/runtimeConfigService.js';

export const requireTicketWorkflowActive = async (req, res, next) => {
  try {
    const pauseState = await getTicketPauseMetadata();
    if (!pauseState.paused) {
      return next();
    }

    return res.status(423).json({
      success: false,
      code: 'TICKET_WORKFLOW_PAUSED',
      message: pauseState.pauseReason
        ? `Ticket workflow is temporarily paused: ${pauseState.pauseReason}`
        : 'Ticket workflow is temporarily paused while runtime configuration is being updated.',
      pauseChangedAt: pauseState.pauseChangedAt || null
    });
  } catch (error) {
    return next(error);
  }
};
