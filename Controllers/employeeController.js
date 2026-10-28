import { asyncHandler } from '../Utils/asyncHandler.js';
import * as sessionService from '../Service/sessionService.js';
import * as queueService from '../Service/queueService.js';

export const windows = asyncHandler(async (req, res) => {
  const all = await sessionService.listWindows(req.user.branchId);
  // assigned employees only see their own window; "no default window" accounts see all of them
  res.json({ windows: req.user.defaultWindowId ? all.filter((w) => w.id === req.user.defaultWindowId) : all, assignedWindowId: req.user.defaultWindowId || null });
});
export const me = asyncHandler(async (req, res) => res.json({ session: await sessionService.getMySession(req.user) }));
export const openWindow = asyncHandler(async (req, res) => res.json({ session: await sessionService.openSession(req.user, req.body.windowId) }));
export const closeWindow = asyncHandler(async (req, res) => { await sessionService.closeSession(req.user); res.json({ ok: true }); });
export const setBreak = asyncHandler(async (req, res) => res.json({ session: await sessionService.setBreak(req.user, req.body.onBreak) }));
export const heartbeat = asyncHandler(async (req, res) => { await sessionService.heartbeat(req.user); res.json({ ok: true }); });

export const next = asyncHandler(async (req, res) => {
  const ticket = await queueService.callNext(req.user);
  res.json({ ticket, empty: !ticket });          // empty = nobody is waiting
});
export const done = asyncHandler(async (req, res) => res.json({ ticket: await queueService.completeTicket(req.user) }));
export const recall = asyncHandler(async (req, res) => res.json({ ticket: await queueService.recallTicket(req.user) }));
export const noShow = asyncHandler(async (req, res) => res.json({ ticket: await queueService.markNoShow(req.user) }));

export const summary = asyncHandler(async (req, res) => res.json(await queueService.getQueueSummary(req.user.branchId)));
export const release = asyncHandler(async (req, res) => { await queueService.releaseTicketById(req.user, req.params.id); res.json({ ok: true }); });
