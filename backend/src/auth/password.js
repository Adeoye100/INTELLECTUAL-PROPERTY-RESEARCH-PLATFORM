import argon2 from 'argon2';

// A valid non-user hash keeps unknown-account login checks on the same Argon2
// path without exposing whether an email exists.
const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$ICcsOGUSqyzhBuRDtXDYNw$qhC6S5bk+DDcoqy8bCmHig3FR4/zclp2RNSh+eNgh7U';

export const passwordHasher = {
  hash(password) {
    return argon2.hash(password, { type: argon2.argon2id });
  },
  verify(hash, password) {
    return argon2.verify(hash, password);
  },
  verifyDummy(password) {
    return argon2.verify(DUMMY_HASH, password);
  },
};
