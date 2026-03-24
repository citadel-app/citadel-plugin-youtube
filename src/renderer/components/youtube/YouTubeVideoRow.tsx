import { Icon } from '@citadel-app/ui';
import { FeedItem } from '@citadel-app/core';

import { formatDistanceToNow } from 'date-fns';


interface YouTubeVideoRowProps {
    item: FeedItem;
    channelName?: string;
    onSelect?: (item: FeedItem) => void;
}

export const YouTubeVideoRow = ({ item, channelName, onSelect }: YouTubeVideoRowProps) => {
    const pubDate = item.pubDate ? new Date(item.pubDate) : null;

    const handleOpenVideo = () => {
        if (onSelect) {
            onSelect(item);
        } else {
            window.open(item.link, '_blank');
        }
    };

    return (
        <div
            onClick={handleOpenVideo}
            className="group cursor-pointer flex items-center gap-4 p-3 rounded-2xl hover:bg-muted/30 transition-all duration-300 border border-transparent hover:border-border/40"
        >
            <div className="relative w-32 aspect-video rounded-xl overflow-hidden bg-muted shadow-inner shrink-0">
                {item.thumbnail ? (
                    <img
                        src={item.thumbnail}
                        alt={item.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/20">
                        <Icon name="Youtube" size={24} />
                    </div>
                )}
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-lg scale-75 group-hover:scale-100 transition-transform">
                        <Icon name="Play" size={12} fill="currentColor" />
                    </div>
                </div>
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-1">
                <h3 className="text-xs font-bold leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                    {item.title}
                </h3>
                <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
                    <span className="truncate">{channelName || item.author}</span>
                    <span className="w-1 h-1 rounded-full bg-border" />
                    <span>{pubDate ? formatDistanceToNow(pubDate, { addSuffix: true }) : 'unknown date'}</span>
                </div>
            </div>
        </div>
    );
};
