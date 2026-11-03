import { Copy, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { CreatedPlayer } from '../teams/api';

/** A spreadsheet treats a leading = + - @ as a formula; neutralise it so a pasted name cannot run one. */
const safeCell = (value: string) => {
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const credentialsCsv = (players: CreatedPlayer[]) =>
  ['name,username,password,side', ...players.map((p) => [p.name, p.username, p.password, p.role].map(safeCell).join(','))].join('\n');

/** The accounts just created. Passwords exist only here: copy or download them now. */
export function Credentials({ players, onDone }: { players: CreatedPlayer[]; onDone: () => void }) {
  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(players.map((p) => `${p.username}\t${p.password}`).join('\n'));
      toast.success('Usernames and passwords copied');
    } catch {
      toast.error('Copy failed. Select the table and copy it by hand.');
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([credentialsCsv(players)], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'players.csv';
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div role="status" aria-label="New player accounts" className="space-y-3 rounded-md border border-success/40 bg-success/10 p-3">
      <div>
        <div className="font-medium text-success">{players.length} account{players.length === 1 ? '' : 's'} created and enrolled</div>
        <p className="text-xs text-muted-foreground">Passwords are shown only now. Copy or download them before you leave this page.</p>
      </div>
      <div className="overflow-x-auto rounded border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th>Username</th>
              <th>Password</th>
              <th>Side</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {players.map((p) => (
              <tr key={p.username}>
                <td className="px-3 py-1.5">{p.name}</td>
                <td className="font-mono">{p.username}</td>
                <td className="font-mono select-all">{p.password}</td>
                <td className="capitalize">{p.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={copyAll}>
          <Copy className="h-4 w-4" /> Copy all
        </Button>
        <Button variant="outline" size="sm" onClick={download}>
          <Download className="h-4 w-4" /> Download CSV
        </Button>
        <Button size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
