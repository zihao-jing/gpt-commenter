// Frontmatter normally starts at offset zero. Allow one document H1 before it.
export function parseHeadingProperties(source, parse) {
  const match = /^#[ \t]+[^\r\n]*\S[^\r\n]*\r?\n(?:[ \t]*\r?\n)*(?=---(?:\r?\n|$))/.exec(source);
  if (!match) return parse(source);

  const offset = match[0].length;
  const heading = parse(source.slice(0, offset));
  if (heading.children.length !== 1 || heading.children[0].type !== 'heading' || heading.children[0].depth !== 1) return parse(source);

  const remainder = parse(source.slice(offset));
  if (remainder.children[0]?.type !== 'yaml') return parse(source);
  const lineOffset = (match[0].match(/\n/g) || []).length;
  function shift(node) {
    if (node.position) for (const point of [node.position.start, node.position.end]) {
      point.offset += offset;
      point.line += lineOffset;
    }
    for (const child of node.children || []) shift(child);
  }
  shift(remainder);
  heading.position.end = remainder.position.end;
  heading.children.push(...remainder.children);
  return heading;
}
