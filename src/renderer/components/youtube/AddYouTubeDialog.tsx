import { Icon, Dialog, DialogContent, DialogTitle, DialogClose, DialogDescription, cn } from '@citadel-app/ui';
import { useState, useEffect } from 'react';
import { useYouTube } from '../../context/YouTubeContext';

interface AddYouTubeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialFeed?: { id: string; url: string; title: string };
}

export const AddYouTubeDialog = ({ open, onOpenChange, initialFeed }: AddYouTubeDialogProps) => {
    const [input, setInput] = useState(initialFeed?.url || '');
    const [isResolving, setIsResolving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { addChannel, updateChannel } = useYouTube();

    const isEdit = !!initialFeed;

    useEffect(() => {
        if (open) {
            setInput(initialFeed ? initialFeed.url : '');
            setError(null);
        }
    }, [open, initialFeed]);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isResolving) return;

        setIsResolving(true);
        setError(null);
        try {
            if (isEdit && initialFeed) {
                await updateChannel(initialFeed.id, input);
            } else {
                await addChannel(input);
            }
            setInput('');
            onOpenChange(false);
        } catch (err: any) {
            setError(err.message || `Failed to ${isEdit ? 'update' : 'resolve'} YouTube channel`);
        } finally {
            setIsResolving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <div className="flex items-center gap-4 mb-8">
                    <div className="p-3.5 rounded-2xl bg-red-500/10 text-red-500 shrink-0 shadow-inner">
                        <Icon name={isEdit ? "Edit3" : "Youtube"} size={24} strokeWidth={2} />
                    </div>
                    <div>
                        <DialogTitle>
                            {isEdit ? 'Edit YouTube Feed' : 'Add YouTube Feed'}
                        </DialogTitle>
                        <DialogDescription>
                            {isEdit ? 'Update the channel handle or URL.' : 'Enter a channel handle, playlist URL, or channel ID.'}
                        </DialogDescription>
                    </div>
                </div>

                <form onSubmit={handleAdd} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Channel or Playlist</label>
                        <div className="relative group">
                            <input
                                autoFocus
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="e.g. @Vsauce or playlist URL"
                                className={cn(
                                    "w-full bg-muted/20 border border-border/40 rounded-2xl px-5 py-3.5 text-sm font-bold outline-none focus:ring-2 ring-red-500/20 transition-all placeholder:italic placeholder:font-medium",
                                    error && "border-red-500/50 ring-red-500/10"
                                )}
                            />
                            {isResolving && (
                                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                    <div className="w-5 h-5 border-2 border-red-500/20 border-t-red-500 rounded-full animate-spin" />
                                </div>
                            )}
                        </div>
                        {error && (
                            <p className="text-[10px] font-bold text-red-500 ml-1 animate-in slide-in-from-top-1">
                                {error}
                            </p>
                        )}
                    </div>

                    <div className="flex gap-3 pt-2">
                        <DialogClose className="flex-1 py-3.5 rounded-2xl bg-muted/50 text-muted-foreground font-black uppercase tracking-widest text-[10px] hover:bg-muted transition-all text-center">
                            Cancel
                        </DialogClose>
                        <button
                            type="submit"
                            disabled={!input.trim() || isResolving}
                            className="flex-[2] py-3.5 rounded-2xl bg-red-600 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-red-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
                        >
                            {isResolving ? 'Working...' : (isEdit ? 'Update Channel' : 'Add Channel')}
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
