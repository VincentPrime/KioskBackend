export const ticketDto = (t) => t && ({
  id: t.id,
  number: t.number,
  category: t.category,
  txn: t.txn,
  status: t.status,
  window: t.window ? { id: t.window.id, name: t.window.name } : (t.windowId ? { id: t.windowId } : null),
  recallCount: t.recallCount,
  createdAt: t.createdAt,
  calledAt: t.calledAt,
  finishedAt: t.finishedAt,
  printCount: t.printCount,
  lastPrintedAt: t.lastPrintedAt,
});

export const userDto = (u) => u && ({
  id: u.id, username: u.username, fullName: u.fullName, role: u.role,
  branchId: u.branchId, isSuper: u.isSuper, defaultWindowId: u.defaultWindowId, isActive: u.isActive,
});
