import { useYouTubePlayer } from '../context/YouTubePlayerContext';
import { SplitPaneLayout, SplitPaneProvider, useCoreServices, Icon, ConfirmDialog, cn } from '@citadel-app/ui';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FeedItem } from '@citadel-app/core';
import { Panel, PanelGroup as Group, PanelResizeHandle as Separator } from 'react-resizable-panels';
import { YouTubeVideoGrid } from '../components/youtube/YouTubeVideoGrid';
import { AddYouTubeDialog } from '../components/youtube/AddYouTubeDialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuItem, DropdownMenuPortal } from '@citadel-app/ui';
import { useMemo, useState, useRef, useEffect } from 'react';
import { useYouTube } from '../context/YouTubeContext';


import { getPrimaryFieldForUrl } from '@citadel-app/core';

const ConvertMenu = ({ item }: { item: FeedItem }) => {
    const navigate = useNavigate();
    const { config, createLocalEntry, toast, getPluginModules } = useCoreServices();

    const handleConvert = async (typeKey: string) => {
        if (!createLocalEntry) {
            toast('Entry creation is not supported in this environment.', { type: 'error' });
            return;
        }

        const entryType = config.entries[typeKey];
        if (!entryType) return;

        const urlField = getPrimaryFieldForUrl(entryType, getPluginModules());

        const entryData: any = {
            title: item.title,
            type: typeKey,
            relatedLinks: [{
                id: item.id,
                type: 'youtube-item',
                title: item.title,
                url: item.link
            }],
            frontmatter: {
                author: item.author,
                publishedAt: item.pubDate,
                videoId: item.videoId,
                thumbnail: item.thumbnail
            }
        };

        if (urlField) {
            entryData[urlField] = item.link;
        } else {
            entryData.frontmatter.sourceUrl = item.link;
        }

        try {
            const entry = await createLocalEntry(entryData);
            navigate(`/${typeKey}/${entry.id}`);
        } catch (error) {
            console.error("Failed to convert entry:", error);
            toast('Failed to convert entry', { type: 'error' });
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    className={cn(
                        "p-2.5 rounded-xl hover:bg-muted text-muted-foreground transition-all flex items-center gap-2 group",
                        "data-[state=open]:bg-muted data-[state=open]:text-foreground"
                    )}
                    title="Convert to Entry"
                >
                    <Icon name="FilePlus" size={14} className="group-hover:text-primary" />
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuPortal>
                <DropdownMenuContent
                    className="min-w-[160px] bg-white dark:bg-zinc-950 text-popover-foreground rounded-xl border border-border/50 shadow-2xl p-2 z-[100] animate-in fade-in-0 zoom-in-95"
                    align="end"
                    sideOffset={5}
                >
                    <DropdownMenuLabel className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                        Convert to...
                    </DropdownMenuLabel>

                    {Object.values(config.entries).map(entryType => (
                        <DropdownMenuItem
                            key={entryType.type}
                            onSelect={() => handleConvert(entryType.type)}
                            className="flex items-center gap-3 px-3 py-2.5 text-xs font-bold outline-none cursor-pointer hover:bg-muted hover:text-foreground rounded-lg focus:bg-muted focus:text-foreground transition-all"
                        >
                            <div className={cn("p-1.5 rounded-md bg-muted group-hover:bg-background transition-colors", entryType.accentColor.replace('text-', 'bg-').replace('600', '500/10'))}>
                                <Icon name={entryType.icon || 'File'} size={14} className={entryType.accentColor} />
                            </div>
                            <span>{entryType.label}</span>
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenuPortal>
        </DropdownMenu>
    );
};

export const YouTubePage = () => {
    const { feeds, refreshFeeds, resetFeed, isLoading } = useYouTube();
    const [searchParams, setSearchParams] = useSearchParams();
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [editingFeed, setEditingFeed] = useState<any>(null);
    const { activeVideo, play, close: closePlayer, placeholderRef } = useYouTubePlayer();
    const [searchQuery, setSearchQuery] = useState('');
    const { settings } = useCoreServices();
    const isZen = settings?.zenMode;
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
    const [videoSortOrder, setVideoSortOrder] = useState<'desc' | 'asc'>('desc');
    const [containerWidth, setContainerWidth] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const [confirmResetFeedId, setConfirmResetFeedId] = useState<string | null>(null);

    const toggleSidebar = () => setIsSidebarCollapsed(!isSidebarCollapsed);
    const toggleSort = () => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    const toggleVideoSort = () => setVideoSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');

    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    const selectedChannelId = searchParams.get('channelId');

    const sortedChannels = useMemo(() => {
        return [...feeds].sort((a, b) => {
            const getLatestDate = (feed: any) => {
                if (!feed.items || feed.items.length === 0) return 0;
                return Math.max(...feed.items.map((i: any) => i.pubDate ? new Date(i.pubDate).getTime() : 0));
            };
            const dateA = getLatestDate(a);
            const dateB = getLatestDate(b);
            return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
        });
    }, [feeds, sortOrder]);

    const activeFeed = useMemo(() => {
        if (!selectedChannelId) return null;
        return feeds.find(f => f.id === selectedChannelId);
    }, [feeds, selectedChannelId]);

    const allVideos = useMemo(() => {
        let baseVideos: { item: FeedItem; channelName: string }[] = [];

        if (activeFeed) {
            baseVideos = activeFeed.items
                .filter(item => !item.channelId || item.channelId === activeFeed.id)
                .map(item => ({ item, channelName: activeFeed.title }));
        } else {
            const flattened = feeds.flatMap(f => f.items
                .filter(item => !item.channelId || item.channelId === f.id)
                .map(item => ({ item, channelName: f.title })));

            // Deduplicate across feeds to prevent React DOM corruption from duplicate keys
            const seen = new Set();
            baseVideos = flattened.filter(v => {
                if (seen.has(v.item.id)) return false;
                seen.add(v.item.id);
                return true;
            });
        }

        // Apply sorting based on videoSortOrder
        baseVideos.sort((a, b) => {
            const dateA = a.item.pubDate ? new Date(a.item.pubDate).getTime() : 0;
            const dateB = b.item.pubDate ? new Date(b.item.pubDate).getTime() : 0;
            return videoSortOrder === 'desc' ? dateB - dateA : dateA - dateB;
        });

        if (!searchQuery.trim()) return baseVideos;

        const query = searchQuery.toLowerCase();
        return baseVideos.filter(v =>
            v.item.title.toLowerCase().includes(query) ||
            v.channelName.toLowerCase().includes(query) ||
            v.item.author?.toLowerCase().includes(query)
        );
    }, [feeds, activeFeed, searchQuery, videoSortOrder]);

    const handleSelectChannel = (id: string | null) => {
        const params = new URLSearchParams(searchParams);
        if (id) params.set('channelId', id);
        else params.delete('channelId');
        setSearchParams(params);
    };

    const handleEdit = (feed: any) => {
        setEditingFeed(feed);
        setIsAddDialogOpen(true);
    };

    const handleReset = async (id: string) => {
        setConfirmResetFeedId(id);
    };

    const handleSelectVideo = (item: FeedItem) => {
        play(item);
    };

    const renderWebview = () => {
        if (!activeVideo) {
            return (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground/30 gap-6 bg-muted/5">
                    <div className="p-12 rounded-[4rem] bg-muted/10 shadow-inner">
                        <Icon name="Youtube" size={80} className="opacity-10" />
                    </div>
                    <div className="text-center font-medieval">
                        <p className="font-bold uppercase tracking-[0.2em] text-xs">Select a video to play</p>
                        <p className="text-[10px] font-bold opacity-40 mt-2 uppercase tracking-widest">Click any thumbnail on the left</p>
                    </div>
                </div>
            );
        }

        return (
            <div className="h-full flex flex-col bg-background border-l border-border/50">
                <header className="h-14 flex items-center justify-between px-6 bg-muted/20 border-b border-border/50 sticky top-0 z-30">
                    <div className="flex items-center gap-3 overflow-hidden pr-4">
                        <div className="p-2 rounded-lg text-red-600 shrink-0">
                            <Icon name="Youtube" size={14} />
                        </div>
                        <h2 className="text-xs font-black uppercase tracking-widest truncate max-w-[300px]">
                            {activeVideo.title}
                        </h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <ConvertMenu item={activeVideo} />
                        <button
                            onClick={() => window.open(activeVideo.link, '_blank')}
                            className="p-2.5 rounded-xl hover:bg-muted text-muted-foreground transition-all flex items-center gap-2 group"
                            title="Open in Browser"
                        >
                            <Icon name="ExternalLink" size={14} className="group-hover:text-primary" />
                        </button>
                        <button
                            onClick={closePlayer}
                            className="p-2.5 rounded-xl hover:bg-muted text-muted-foreground transition-all"
                        >
                            <Icon name="X" size={14} />
                        </button>
                    </div>
                </header>
                <div
                    ref={placeholderRef}
                    className="flex-1 relative overflow-hidden bg-black"
                >
                    {/* The global webview will position itself over this div */}
                </div>
            </div>
        );
    };

    return (
        <SplitPaneProvider>
            <div className="h-full w-full overflow-hidden bg-background">
                <Group orientation="horizontal" className="h-full">
                    {!isSidebarCollapsed && !isZen && (
                        <Panel
                            defaultSize={250}
                            minSize={150}
                            maxSize={500}
                            className="flex flex-col bg-muted/5"
                        >
                        <YouTubeChannelList
                            channels={sortedChannels}
                            selectedId={selectedChannelId}
                            onSelect={handleSelectChannel}
                            onAdd={() => {
                                setEditingFeed(null);
                                setIsAddDialogOpen(true);
                            }}
                            onEdit={handleEdit}
                            onRefresh={refreshFeeds}
                            isLoading={isLoading}
                            onToggleSidebar={toggleSidebar}
                            sortOrder={sortOrder}
                            onToggleSort={toggleSort}
                        />
                    </Panel>
                )}

                {!isSidebarCollapsed && !isZen && (
                    <Separator className="w-1 bg-border/20 hover:bg-primary/50 transition-colors cursor-col-resize relative z-10">
                        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-border/50 group-hover:bg-primary transition-colors" />
                    </Separator>
                )}

                <Panel className="flex flex-col min-h-0 bg-background relative overflow-hidden">
                    {isSidebarCollapsed && (
                        <button
                            onClick={toggleSidebar}
                            className="absolute left-0 top-14 z-50 p-1.5 rounded-r-lg bg-primary text-primary-foreground shadow-md hover:pl-3 transition-all animate-in slide-in-from-left duration-300 group"
                            title="Expand Sidebar"
                        >
                            <Icon name="ChevronRight" size={16} className="group-hover:scale-110 transition-transform" />
                        </button>
                    )}
                    <SplitPaneLayout
                        className="h-full"
                        leftPanel={
                            <div ref={containerRef} className="h-full overflow-y-auto custom-scrollbar bg-background">
                                <header className="p-8 pb-4 flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-xl z-20">
                                    <div>
                                        <h1 className="text-3xl font-bold uppercase tracking-tighter font-medieval">
                                            {activeFeed ? activeFeed.title : 'The Sight'}
                                        </h1>
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1 opacity-60">
                                            {activeFeed ? 'Single Channel View' : 'All Updates from Channels & Playlists'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={toggleVideoSort}
                                                className={cn(
                                                    "p-3 rounded-2xl bg-muted/50 text-muted-foreground hover:bg-muted transition-all flex items-center gap-2 px-5",
                                                    videoSortOrder && "text-primary"
                                                )}
                                                title={videoSortOrder === 'desc' ? "Sorted by Newest First" : "Sorted by Oldest First"}
                                            >
                                                <Icon name={videoSortOrder === 'desc' ? "SortDesc" : "SortAsc"} size={16} />
                                                <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">Sort</span>
                                            </button>
                                        </div>
                                        <div className="relative group w-64">
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-primary transition-colors">
                                                <Icon name="Search" size={14} strokeWidth={3} />
                                            </div>
                                            <input
                                                type="text"
                                                placeholder="Search videos..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="w-full bg-muted/30 border border-transparent focus:border-primary/20 focus:bg-muted/50 rounded-2xl py-3 pl-11 pr-4 text-xs font-bold outline-none transition-all placeholder:text-muted-foreground/30 placeholder:uppercase placeholder:tracking-widest"
                                            />
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {activeFeed && (
                                                <>
                                                    <button
                                                        onClick={() => handleReset(activeFeed.id)}
                                                        className="p-3.5 rounded-2xl bg-muted/50 text-muted-foreground hover:bg-yellow-500/10 hover:text-yellow-600 transition-all flex items-center gap-2 px-6"
                                                        title="Reset Feed"
                                                    >
                                                        <Icon name="RotateCcw" size={16} />
                                                        <span className="text-[10px] font-black uppercase tracking-widest">Reset</span>
                                                    </button>
                                                    <button
                                                        onClick={() => handleSelectChannel(null)}
                                                        className="p-3.5 rounded-2xl bg-muted/50 text-muted-foreground hover:bg-muted transition-all"
                                                    >
                                                        <Icon name="X" size={18} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </header>

                                <YouTubeVideoGrid
                                    items={allVideos}
                                    onSelect={handleSelectVideo}
                                    viewMode={(activeVideo || containerWidth < 850) ? 'list' : 'grid'}
                                />
                            </div>
                        }
                        rightPanel={renderWebview()}
                    />
                </Panel>
            </Group>

            <AddYouTubeDialog
                open={isAddDialogOpen}
                onOpenChange={setIsAddDialogOpen}
                initialFeed={editingFeed}
            />

            <ConfirmDialog
                open={!!confirmResetFeedId}
                onOpenChange={(open) => !open && setConfirmResetFeedId(null)}
                title="Reset Feed"
                description="Are you sure you want to reset this feed? All existing videos will be cleared and re-fetched."
                confirmLabel="Reset"
                onConfirm={async () => {
                    if (confirmResetFeedId) {
                        await resetFeed(confirmResetFeedId);
                    }
                    setConfirmResetFeedId(null);
                }}
                variant="destructive"
            />
        </div>
        </SplitPaneProvider>
    );
};

const YouTubeChannelList = ({ channels, selectedId, onSelect, onAdd, onEdit, onRefresh, isLoading, onToggleSidebar, sortOrder, onToggleSort }: any) => {
    return (
        <div className="h-full flex flex-col bg-muted/20 border-r border-border/50">
            <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-red-500 text-white">
                        <Icon name="Youtube" size={16} />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest font-medieval">YouTube</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={onToggleSort}
                        className={cn(
                            "p-2 rounded-xl hover:bg-muted transition-all text-muted-foreground",
                            sortOrder && "text-primary"
                        )}
                        title={sortOrder === 'desc' ? "Sorted by Recency (Newest First)" : "Sorted by Recency (Oldest First)"}
                    >
                        <Icon name={sortOrder === 'desc' ? "SortDesc" : "SortAsc"} size={14} />
                    </button>
                    <button
                        onClick={onRefresh}
                        className={cn(
                            "p-2 rounded-xl hover:bg-muted transition-all text-muted-foreground",
                            isLoading && "animate-spin text-primary"
                        )}
                        title="Refresh Feeds"
                    >
                        <Icon name="RefreshCw" size={14} />
                    </button>
                    {onToggleSidebar && (
                        <button
                            onClick={onToggleSidebar}
                            className="p-2 rounded-xl hover:bg-muted text-muted-foreground transition-all"
                            title="Collapse Sidebar"
                        >
                            <Icon name="ChevronLeft" size={14} />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-2 space-y-1 custom-scrollbar">
                <button
                    onClick={() => onSelect(null)}
                    className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all group",
                        !selectedId ? "bg-primary/10 text-primary" : "hover:bg-muted/50 text-muted-foreground"
                    )}
                >
                    <Icon name="LayoutGrid" size={16} className={cn(!selectedId ? "opacity-100" : "opacity-40 group-hover:opacity-100")} />
                    <span className="text-xs font-bold truncate">The Collective Sight</span>
                </button>

                <div className="my-2 h-px bg-border/40 mx-2" />

                {channels.map((channel: any) => (
                    <div key={channel.id} className="relative group">
                        <button
                            onClick={() => onSelect(channel.id)}
                            className={cn(
                                "w-full flex items-center gap-2 px-1 py-1 rounded-2xl transition-all group/btn text-left",
                                selectedId === channel.id ? "bg-red-500/10 text-red-600 border border-red-500/20" : "hover:bg-muted/50 text-muted-foreground border border-transparent"
                            )}
                        >
                            <div className={cn(
                                "w-4 h-4 rounded-xl flex items-center justify-center shrink-0 shadow-inner",
                                selectedId === channel.id ? "bg-red-500/20" : ""
                            )}>
                                <Icon name="Youtube" size={12} className={cn(selectedId === channel.id ? "text-red-600" : "opacity-40")} />
                            </div>
                            <div className="flex-1 min-w-0 items-center">
                                <div className="text-[11px] font-bold truncate">{channel.title}</div>
                                {channel.error && (
                                    <div className="text-[8px] text-red-500 font-bold truncate uppercase tracking-tighter opacity-80">
                                        Refresh Failed
                                    </div>
                                )}
                            </div>
                        </button>

                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit(channel);
                                }}
                                className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-all"
                                title="Edit Channel"
                            >
                                <Icon name="Edit3" size={12} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <div className="p-4">
                <button
                    onClick={onAdd}
                    className="w-full py-4 bg-foreground text-background font-bold uppercase tracking-widest text-[9px] active:scale-95 btn-forged"
                >
                    <Icon name="Plus" size={14} strokeWidth={3} />
                    Add Channel / Playlist
                </button>
            </div>
        </div>
    );
};
