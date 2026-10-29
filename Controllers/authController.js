import { asyncHandler } from '../Utils/asyncHandler.js';
import { userDto } from '../Utils/serialize.js';
import * as authService from '../Service/authService.js';
import * as sessionService from '../Service/sessionService.js';

// POST /auth/login -> { token, user }. The client keeps the token and sends it as "Authorization: Bearer <token>".
export const login = asyncHandler(async (req, res) => {
  const { token, user } = await authService.login(req.body.username, req.body.password);
  res.json({ user: userDto(user), token });
});

// Closes the employee's window (blocked with 409 while a customer is being served). The client then discards its token.
export const logout = asyncHandler(async (req, res) => {
  await sessionService.closeSession(req.user);
  res.json({ ok: true });
});

export const me = (req, res) => res.json({ user: userDto(req.user) });
