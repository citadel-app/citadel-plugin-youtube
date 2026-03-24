import { Icon } from '@citadel-app/ui';
import { FeedItem } from '@citadel-app/core';

import { formatDistanceToNow } from 'date-fns';


interface YouTubeVideoCardProps {
    item: FeedItem;
    channelName?: string;
    onSelect?: (item: FeedItem) => void;
}

export const YouTubeVideoCard = ({ item, channelName, onSelect }: YouTubeVideoCardProps) => {
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
            className="group cursor-pointer flex flex-col gap-3 p-3 rounded-[2rem] hover:bg-muted/30 transition-all duration-300 border border-transparent hover:border-border/40 hover:shadow-xl"
        >
            <div className="relative aspect-video rounded-[1.5rem] overflow-hidden bg-muted shadow-inner">
                {(item as any).thumbnail ? (
                    <img
                        src={(item as any).thumbnail}
                        alt={item.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/20">
                        <Icon name="Youtube" size={48} />
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
                    <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-lg">
                        <Icon name="Play" size={16} fill="currentColor" />
                    </div>
                </div>
            </div>

            <div className="px-1 flex flex-col gap-1.5">
                <h3 className="text-sm font-bold leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                    {item.title}
                </h3>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                    <span className="truncate">{channelName || item.author}</span>
                    <span className="w-1 h-1 rounded-full bg-border" />
                    <span>{pubDate ? formatDistanceToNow(pubDate, { addSuffix: true }) : 'unknown date'}</span>
                </div>
            </div>
        </div>
    );
};
