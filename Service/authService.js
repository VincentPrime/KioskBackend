import bcrypt from 'bcryptjs';
import { User } from '../Models/index.js';
import { ApiError } from '../Utils/ApiError.js';
import { signJwt } from '../Utils/token.js';

export const hashPassword = (plain) => bcrypt.hash(plain, 12);

// Compared against a dummy hash when the user doesn't exist so response time doesn't reveal valid usernames
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

export async function login(username, password) {
  const user = await User.scope('withPassword').findOne({ where: { username: username.trim().toLowerCase() } });
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !user.isActive || !ok) throw ApiError.unauthorized('Invalid username or password', 'BAD_CREDENTIALS');
  return { token: signJwt(user), user };
}
