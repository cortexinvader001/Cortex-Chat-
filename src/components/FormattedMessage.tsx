import React, { useState } from 'react';
import { Copy, Check, Terminal } from 'lucide-react';

interface FormattedMessageProps {
  text: string;
}

export default function FormattedMessage({ text }: FormattedMessageProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopyCode = (code: string, index: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (!text) return null;

  // Split content based on triple-backtick code blocks to isolate code segments
  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2 text-xs font-sans leading-relaxed select-text">
      {parts.map((part, index) => {
        // Checking if this chunk is a Code Block (starts and ends with ```)
        if (part.startsWith('```') && part.endsWith('```')) {
          // Extract the language and raw content body
          const rawLines = part.slice(3, -3).trim().split('\n');
          let language = 'code';
          let codeContent = '';

          const firstLine = rawLines[0] ? rawLines[0].trim().toLowerCase() : '';
          const knownLanguages = ['python', 'javascript', 'typescript', 'html', 'css', 'bash', 'json', 'sql', 'yaml', 'markdown', 'rust', 'go', 'c', 'cpp', 'java'];
          
          if (firstLine && knownLanguages.includes(firstLine)) {
            language = firstLine;
            codeContent = rawLines.slice(1).join('\n');
          } else {
            codeContent = rawLines.join('\n');
          }

          return (
            <div key={index} className="my-3 border border-white/10 rounded-xl overflow-hidden shadow-md bg-black/40">
              {/* Toolbar */}
              <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#121b22]/90 border-b border-white/5 select-none text-[10px] text-gray-400 font-mono">
                <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-emerald-400">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>{language}</span>
                </div>
                <button
                  onClick={() => handleCopyCode(codeContent, index)}
                  className="flex items-center gap-1 hover:text-white transition-colors py-0.5 px-2 rounded hover:bg-white/5 cursor-pointer"
                  title="Copy code snippet to clipboard"
                >
                  {copiedIndex === index ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400 font-semibold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Code</span>
                    </>
                  )}
                </button>
              </div>
              {/* Code text content area */}
              <pre className="p-3.5 overflow-x-auto text-[11px] font-mono leading-relaxed text-slate-200 select-text max-h-[350px]">
                <code>{codeContent}</code>
              </pre>
            </div>
          );
        }

        // Processing normal paragraphs, handles inline bolding, lists, and tables
        const lines = part.split('\n');

        return (
          <div key={index} className="space-y-1.5">
            {lines.map((line, lineIndex) => {
              const trimmedLine = line.trim();

              // 1. Is this a table row? (starts and ends with pipe '|', containing at least one more '|')
              if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|') && trimmedLine.split('|').length > 2) {
                // Ignore the separator line like |---| or |:---:|
                if (trimmedLine.includes('---') || trimmedLine.match(/^[|:\-\s]+$/)) {
                  return (
                    <div key={lineIndex} className="border-t border-white/10 my-1 first:hidden" />
                  );
                }

                const cells = trimmedLine
                  .split('|')
                  .slice(1, -1)
                  .map((cell) => cell.trim());

                const isHeader = lineIndex === 0 || (lines[lineIndex - 1] && lines[lineIndex - 1].includes('---'));

                return (
                  <div key={lineIndex} className="overflow-x-auto my-1">
                    <table className="min-w-full divide-y divide-white/10 border border-white/10 rounded-lg">
                      <tbody>
                        <tr className={`${isHeader ? 'bg-white/10 font-bold' : 'hover:bg-white/5 bg-black/10'} transition-all`}>
                          {cells.map((cell, cIdx) => (
                            <td key={cIdx} className="px-3 py-1.5 border-r border-white/5 last:border-r-0 text-slate-200 font-mono text-[10px]">
                              {renderInlineMarkup(cell, `table-${index}-${lineIndex}-${cIdx}`)}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              }

              // 2. Is this a bulleted item list?
              if (trimmedLine.startsWith('* ') || trimmedLine.startsWith('- ')) {
                const listContent = trimmedLine.substring(2);
                return (
                  <ul key={lineIndex} className="list-disc pl-5 my-1 text-slate-200 space-y-0.5">
                    <li className="text-xs leading-relaxed">
                      {renderInlineMarkup(listContent, `bullet-${index}-${lineIndex}`)}
                    </li>
                  </ul>
                );
              }

              // 3. Is this a numbered list? (e.g. 1. , 2. )
              if (/^\d+\.\s/.test(trimmedLine)) {
                const markerMatch = trimmedLine.match(/^(\d+\.)\s/);
                const marker = markerMatch ? markerMatch[1] : '';
                const listContent = trimmedLine.replace(/^\d+\.\s/, '');
                return (
                  <div key={lineIndex} className="flex gap-2.5 my-1 pl-1 text-xs text-slate-200">
                    <span className="font-mono text-emerald-400 font-semibold shrink-0">{marker}</span>
                    <span className="leading-relaxed flex-1">{renderInlineMarkup(listContent, `num-${index}-${lineIndex}`)}</span>
                  </div>
                );
              }

              // 4. Default standard paragraph / plain text line
              if (trimmedLine === '') {
                return <div key={lineIndex} className="h-1.5" />;
              }

              return (
                <p key={lineIndex} className="text-xs text-slate-200 leading-relaxed break-words font-sans">
                  {renderInlineMarkup(line, `p-${index}-${lineIndex}`)}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// Subhelper to parse bold (*), strikethrough (~), and inline code (`)
function renderInlineMarkup(textBlock: string, parentKey: string): React.ReactNode {
  if (!textBlock) return '';

  // Parse inline backticks first `code`
  const backtickParts = textBlock.split(/(`[^`\n]+`)/g);

  return (
    <React.Fragment key={parentKey}>
      {backtickParts.map((bPart, bIdx) => {
        const bKey = `${parentKey}-bt-${bIdx}`;
        if (bPart.startsWith('`') && bPart.endsWith('`')) {
          const inlineCode = bPart.slice(1, -1);
          return (
            <code key={bKey} className="bg-black/40 text-emerald-300 font-mono px-1.5 py-0.5 rounded border border-white/5 text-[10.5px] mx-0.5 select-text">
              {inlineCode}
            </code>
          );
        }

        // Parse Bold (*bold*) inside this chunk
        const boldParts = bPart.split(/(\*[^*]+\*)/g);

        return (
          <React.Fragment key={bKey}>
            {boldParts.map((boldPart, boldIdx) => {
              const boldKey = `${bKey}-bld-${boldIdx}`;
              if (boldPart.startsWith('*') && boldPart.endsWith('*')) {
                const boldText = boldPart.slice(1, -1);
                return (
                  <strong key={boldKey} className="font-extrabold text-emerald-400">
                    {parseStrikethroughAndMentions(boldText, boldKey)}
                  </strong>
                );
              }

              return (
                <React.Fragment key={boldKey}>
                  {parseStrikethroughAndMentions(boldPart, boldKey)}
                </React.Fragment>
              );
            })}
          </React.Fragment>
        );
      })}
    </React.Fragment>
  );
}

// Subhelper to parse strikethrough ~strike~ and @mentions
function parseStrikethroughAndMentions(text: string, parentKey: string): React.ReactNode {
  const strikeParts = text.split(/(~[^~]+~)/g);
  return (
    <React.Fragment key={parentKey}>
      {strikeParts.map((part, idx) => {
        const strikeKey = `${parentKey}-strk-${idx}`;
        if (part.startsWith('~') && part.endsWith('~')) {
          const strikeText = part.slice(1, -1);
          return (
            <span key={strikeKey} className="line-through text-slate-400">
              {parseMentions(strikeText, strikeKey)}
            </span>
          );
        }
        return (
          <React.Fragment key={strikeKey}>
            {parseMentions(part, strikeKey)}
          </React.Fragment>
        );
      })}
    </React.Fragment>
  );
}

// Subhelper to parse @mentions (e.g. @user)
function parseMentions(text: string, parentKey: string): React.ReactNode {
  const mentionParts = text.split(/(@[a-zA-Z0-9_\-]+)/g);
  return (
    <React.Fragment key={parentKey}>
      {mentionParts.map((part, idx) => {
        const mentionKey = `${parentKey}-mnt-${idx}`;
        if (part.startsWith('@')) {
          return (
            <span key={mentionKey} className="bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.5 rounded-md mx-0.5 border border-emerald-500/30 text-[11px] inline-block font-sans select-none">
              {part}
            </span>
          );
        }
        return (
          <React.Fragment key={mentionKey}>
            {part}
          </React.Fragment>
        );
      })}
    </React.Fragment>
  );
}
