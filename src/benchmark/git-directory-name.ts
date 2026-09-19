/**
 * Git refuses to commit a nested `.git`, so every tree the repository stores
 * that carries a repository of its own stores it under this name: a case's
 * fixture on the way in, and an attempt's preserved state on the way out.
 * Both ends read the name from here so a rename cannot open one and leave the
 * other looking for the old one.
 */
export const STORED_GIT_DIRECTORY = "dot-git";
