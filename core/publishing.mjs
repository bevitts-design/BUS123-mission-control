export function parseGitStatus(text, publishPaths = []) {
  const allowed = new Set(publishPaths);
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2);
      const path = line.slice(2).trim().replace(/^.* -> /, "");
      return {
        line,
        status,
        path,
        staged: status[0] !== " " && status[0] !== "?",
        unstaged: status[1] !== " " || status === "??",
        deleted: status.includes("D"),
        displayStatus: status === "??"
          ? "New"
          : status.includes("D")
            ? "Deleted"
            : status.includes("A")
              ? "Added"
              : "Modified",
        publishPath: allowed.has(path)
      };
    });
}
