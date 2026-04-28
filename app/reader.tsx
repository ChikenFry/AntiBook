import { useLocalSearchParams, useRouter } from 'expo-router';
import { BookOpen, ChevronLeft, FileText, ZoomIn, ZoomOut } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import Pdf from 'react-native-pdf';
import { useLibrary } from '../lib/LibraryContext';

export default function ReaderScreen() {
  const router = useRouter();
  const { id, anchor, page } = useLocalSearchParams();
  const { books } = useLibrary();
  const scrollViewRef = useRef<ScrollView>(null);
  const yOffsets = useRef<Record<string, number>>({});
  const pendingReaderAnchorRef = useRef<string | null>(null);
  const hasScrolledToAnchorRef = useRef(false);
  const paragraphCounterRef = useRef<number>(0);
  const currentParagraphIndexRef = useRef<number>(0);
  const book = books.find(b => b.id === id);
  const pageAnchors = book?.page_anchors;

  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(page ? parseInt(page as string, 10) : 1);
  const [isReadingMode, setIsReadingMode] = useState(false);

  // Responsive Text Engine Values
  const [fontSizeMultiplier, setFontSizeMultiplier] = useState(1);
  const baseFontSize = 16; // reduced for concrete view
  const currentSize = baseFontSize * fontSizeMultiplier;

  useEffect(() => {
    console.log(`[ReaderScreen] useEffect: isReadingMode=${isReadingMode}`);
    if (!isReadingMode || !pageAnchors) return;
    // Only set anchor if we don't already have a pending one
    if (!pendingReaderAnchorRef.current) {
      const anchor = pageAnchors[currentPage.toString()] ?? null;
      console.log(`[ReaderScreen] useEffect setting pendingReaderAnchorRef to:`, anchor);
      pendingReaderAnchorRef.current = anchor !== null ? anchor.toString() : null;
    } else {
      console.log(`[ReaderScreen] useEffect keeping existing pendingReaderAnchorRef:`, pendingReaderAnchorRef.current);
    }
  }, [isReadingMode]);

  if (!book) {
    return (
      <View style={[styles.container, { paddingTop: 60, paddingHorizontal: 16 }]}>
        <Pressable onPress={() => router.back()} style={{ marginBottom: 24, alignSelf: 'flex-start' }}>
          <ChevronLeft color="#fff" size={28} />
        </Pressable>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 18 }}>Book not found in active session.</Text>
          <Text style={{ color: '#888', marginTop: 8 }}>Please delete and re-upload the PDF to restore state.</Text>
        </View>
      </View>
    );
  }

  const getAnchorForPage = (pageNumber: number) => {
    if (!pageAnchors) return null;

    let targetIndex = pageAnchors[pageNumber.toString()];
    if (typeof targetIndex !== 'number') {
      targetIndex = parseInt(targetIndex as string, 10);
    }
    if (isNaN(targetIndex)) return null;

    return targetIndex.toString();
  };

  const pIdxToPage = React.useMemo(() => {
    if (!pageAnchors) return {};
    const map: Record<number, number[]> = {};
    for (const [pageStr, pIdx] of Object.entries(pageAnchors)) {
      const parsedIdx = typeof pIdx === 'number' ? pIdx : parseInt(pIdx as string, 10);
      if (!map[parsedIdx]) map[parsedIdx] = [];
      map[parsedIdx].push(parseInt(pageStr, 10));
    }
    return map;
  }, [pageAnchors]);

  const handleToggleMode = () => {
    const nextMode = !isReadingMode;
    console.log(`[ReaderScreen] handleToggleMode triggered. Next Mode: ${nextMode ? 'Reader' : 'PDF'}. Current Page: ${currentPage}`);

    if (nextMode) {
      const anchorToSet = getAnchorForPage(currentPage);
      console.log(`[ReaderScreen] Toggle Mode setting pendingReaderAnchorRef to:`, anchorToSet);
      pendingReaderAnchorRef.current = anchorToSet !== null ? anchorToSet.toString() : null;
      hasScrolledToAnchorRef.current = false; // reset scroll flag
    } else {
      console.log(`[ReaderScreen] Toggle Mode clearing pendingReaderAnchorRef.`);
      pendingReaderAnchorRef.current = null;
    }

    setIsReadingMode(nextMode);
  };

  const handleScroll = (event: any) => {
    if (pendingReaderAnchorRef.current) return;
    if (!isReadingMode || !pageAnchors) return;
    
    const scrollY = event.nativeEvent.contentOffset.y;
    
    // Find closest paragraph index
    let closestIndex = 0;
    let minDiff = Infinity;
    for (const [indexStr, yPos] of Object.entries(yOffsets.current)) {
        const diff = Math.abs(yPos - scrollY);
        if (diff < minDiff) {
            minDiff = diff;
            closestIndex = parseInt(indexStr, 10);
        }
    }
    
    currentParagraphIndexRef.current = closestIndex;
    
    let bestPage = currentPage;
    let maxAnchorIdx = -1;
    for (const [pageStr, pIdx] of Object.entries(pageAnchors)) {
        const parsedIdx = typeof pIdx === 'number' ? pIdx : parseInt(pIdx as string, 10);
        if (parsedIdx <= closestIndex && parsedIdx > maxAnchorIdx) {
            maxAnchorIdx = parsedIdx;
            bestPage = parseInt(pageStr, 10);
        }
    }
    
    if (bestPage !== currentPage && bestPage > 0) {
      setCurrentPage(bestPage);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: 60 }]}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => router.back()} style={{ paddingRight: 12 }}>
            <ChevronLeft color="#fff" size={28} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{book.title}</Text>
            {!isReadingMode && (
              <Text style={styles.pageTracker}>
                Page {currentPage} of {totalPages || '?'}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.headerRight}>
          {isReadingMode && (
            <View style={styles.fontControls}>
              <Pressable 
                onPress={() => {
                  pendingReaderAnchorRef.current = currentParagraphIndexRef.current.toString();
                  hasScrolledToAnchorRef.current = false;
                  setFontSizeMultiplier(prev => Math.max(0.5, prev - 0.2));
                }}
                style={styles.fontBtn}
              >
                <ZoomOut color="#ccc" size={18} />
              </Pressable>
              <Pressable 
                onPress={() => {
                  pendingReaderAnchorRef.current = currentParagraphIndexRef.current.toString();
                  hasScrolledToAnchorRef.current = false;
                  setFontSizeMultiplier(prev => Math.min(3.0, prev + 0.2));
                }}
                style={styles.fontBtn}
              >
                <ZoomIn color="#ccc" size={18} />
              </Pressable>
            </View>
          )}

          <Pressable 
            style={styles.modeToggle}
            onPress={handleToggleMode}
          >
            {isReadingMode ? (
              <FileText color="#fff" size={20} />
            ) : (
              <BookOpen color="#fff" size={20} />
            )}
            <Text style={styles.modeToggleText}>
              {isReadingMode ? "Original" : "Reader"}
            </Text>
          </Pressable>
        </View>
      </View>

      {isReadingMode ? (
        <View style={styles.responsiveReaderCanvas}>
          {(() => {
            paragraphCounterRef.current = 0;
            return (
              <ScrollView 
                ref={scrollViewRef} 
                contentContainerStyle={styles.scrollContent} 
                showsVerticalScrollIndicator={false}
                onScroll={handleScroll}
                scrollEventThrottle={100}
              >
                <Markdown 
                  rules={{
                    paragraph: (node, children, parent, styles) => {
                      const currentIndex = paragraphCounterRef.current++;
                      const currentIndexStr = currentIndex.toString();
                      
                      const pages = pIdxToPage[currentIndex];
                      const pageText = pages ? 
                          (pages.length > 1 ? `PAGES ${pages[0]}-${pages[pages.length-1]}` : `PAGE ${pages[0]}`) 
                          : null;

                      return (
                        <View 
                          key={node.key}
                          onLayout={(e) => {
                            const y = e.nativeEvent.layout.y;
                            yOffsets.current[currentIndexStr] = y;

                            if (!hasScrolledToAnchorRef.current) {
                              const liveAnchor = pendingReaderAnchorRef.current;
                              if (liveAnchor === currentIndexStr || anchor === currentIndexStr) {
                                console.log(`[ReaderScreen] MATCH FOUND! Scrolling to Y: ${y} for index: ${currentIndexStr}`);
                                hasScrolledToAnchorRef.current = true;
                                scrollViewRef.current?.scrollTo({ y, animated: false });
                                pendingReaderAnchorRef.current = null;
                              }
                            }
                          }}
                        >
                          {pageText && (
                            <View style={{ marginVertical: 32, alignItems: 'center', opacity: 0.5 }}>
                              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 2 }}>
                                — {pageText} —
                              </Text>
                            </View>
                          )}
                          <View style={{ marginBottom: 16 }}>
                            {children}
                          </View>
                        </View>
                      );
                    },
                image: (node, children, parent, styles) => {
                  return (
                    <Image
                      key={node.key}
                      style={{ width: '100%', aspectRatio: 1.5, resizeMode: 'contain', marginVertical: 16 }}
                      source={{ uri: node.attributes.src }}
                      alt={node.attributes.alt}
                    />
                  );
                }
              }}
              style={{
              body: { 
                color: '#e0e0e0', 
                fontSize: currentSize, 
                lineHeight: currentSize * 1.6,
              },
              heading1: { 
                color: '#fff', 
                marginTop: 24, 
                marginBottom: 12, 
                fontSize: currentSize * 1.5 
              },
              heading2: { 
                color: '#fff', 
                marginTop: 20, 
                marginBottom: 10, 
                fontSize: currentSize * 1.3 
              },
              list_item: { 
                color: '#e0e0e0', 
                fontSize: currentSize, 
                marginBottom: 4 
              }
            }}>
              {book.text || "Loading markdown..."}
            </Markdown>
          </ScrollView>
            );
          })()}
        </View>
      ) : (
        <Pdf
          page={currentPage}
          source={{ uri: book.uri, cache: true }}
          onLoadComplete={(numberOfPages) => setTotalPages(numberOfPages)}
          onPageChanged={(page) => setCurrentPage(page)}
          onError={(error) => console.log("PDF Render Error:", error)}
          style={styles.pdf}
          trustAllCerts={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 8,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#222'
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 16
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  pageTracker: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 4,
  },
  fontControls: {
    flexDirection: 'row',
    backgroundColor: '#222',
    borderRadius: 8,
    overflow: 'hidden',
  },
  fontBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRightWidth: 1,
    borderRightColor: '#111',
  },
  modeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#444',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modeToggleText: {
    color: '#fff',
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '600',
  },
  responsiveReaderCanvas: {
    flex: 1, 
    flexWrap: 'wrap',
    paddingHorizontal: 0
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 100,
  },
  pdf: {
    flex: 1,
    width: Dimensions.get('window').width,
    backgroundColor: '#111',
  }
});
