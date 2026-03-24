import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { FeedItem } from '@citadel-app/core';

interface YouTubePlayerContextType {
    activeVideo: FeedItem | null;
    isFloating: boolean;
    miniPlayerWidth: number;
    play: (video: FeedItem) => void;
    close: () => void;
    setFloating: (floating: boolean) => void;
    setMiniPlayerWidth: (width: number) => void;
    placeholderRef: React.RefObject<HTMLDivElement>;
}

const YouTubePlayerContext = createContext<YouTubePlayerContextType | undefined>(undefined);

export const YouTubePlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [activeVideo, setActiveVideo] = useState<FeedItem | null>(null);
    const [isFloating, setIsFloating] = useState(false);
    const [miniPlayerWidth, setMiniPlayerWidth] = useState(640);
    const placeholderRef = useRef<HTMLDivElement>(null);

    const play = useCallback((video: FeedItem) => {
        setActiveVideo(video);
        setIsFloating(false);
    }, []);

    const close = useCallback(() => {
        setActiveVideo(null);
        setIsFloating(false);
    }, []);

    const setFloating = useCallback((floating: boolean) => {
        setIsFloating(floating);
    }, []);

    return (
        <YouTubePlayerContext.Provider value={{
            activeVideo,
            isFloating,
            miniPlayerWidth,
            play,
            close,
            setFloating,
            setMiniPlayerWidth,
            placeholderRef
        }}>
            {children}
        </YouTubePlayerContext.Provider>
    );
};

export const useYouTubePlayer = () => {
    const context = useContext(YouTubePlayerContext);
    if (!context) throw new Error('useYouTubePlayer must be used within a YouTubePlayerProvider');
    return context;
};
