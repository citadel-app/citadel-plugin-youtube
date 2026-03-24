import { cn, Icon } from '@citadel-app/ui';
import { FeedItem } from '@citadel-app/core';
import { YouTubeVideoCard } from './YouTubeVideoCard';
import { YouTubeVideoRow } from './YouTubeVideoRow';



interface YouTubeVideoGridProps {
    items: { item: FeedItem; channelName: string }[];
    onSelect?: (item: FeedItem) => void;
    viewMode?: 'grid' | 'list';
}

export const YouTubeVideoGrid = ({ items, onSelect, viewMode = 'grid' }: YouTubeVideoGridProps) => {
    return (
        <div className={cn(
            "p-6",
            viewMode === 'grid'
                ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6"
                : "flex flex-col gap-2"
        )}>
            {items.map(({ item, channelName }) => (
                viewMode === 'grid' ? (
                    <YouTubeVideoCard
                        key={item.id}
                        item={item}
                        channelName={channelName}
                        onSelect={onSelect}
                    />
                ) : (
                    <YouTubeVideoRow
                        key={item.id}
                        item={item}
                        channelName={channelName}
                        onSelect={onSelect}
                    />
                )
            ))}
            {items.length === 0 && (
                <div className="col-span-full h-96 flex flex-col items-center justify-center text-muted-foreground/30 gap-4">
                    <div className="p-8 rounded-[3rem] bg-muted/20 shadow-inner">
                        <Icon name="Youtube" size={64} className="opacity-20" />
                    </div>
                    <p className="font-black uppercase tracking-widest text-[10px]">No videos found</p>
                </div>
            )}
        </div>
    );
};
