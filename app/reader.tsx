import { useLocalSearchParams, useRouter } from 'expo-router';
import { BookmarkPlus, BookOpen, ChevronLeft, FileText, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions, findNodeHandle, FlatList, Image, KeyboardAvoidingView,
  Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import Pdf from 'react-native-pdf';
import { useLibrary } from '../lib/LibraryContext';

export default function ReaderScreen() {
  const router = useRouter();
  const { id, page } = useLocalSearchParams();
  const { books, addMarker, removeMarker } = useLibrary();
  const scrollViewRef = useRef<ScrollView>(null);
  const yOffsets = useRef<Record<string, number>>({});
  const pageViewRefs = useRef<Record<string, View | null>>({});
  const totalContentHeightRef = useRef(0);
  const pendingReaderAnchorRef = useRef<string | null>(null);
  const hasScrolledToAnchorRef = useRef(false);
  const contentSizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const book = books.find(b => b.id === id);
  const markers = book?.markers || [];

  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(page ? parseInt(page as string, 10) : 1);
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [fontSizeMultiplier, setFontSizeMultiplier] = useState(1);
  const [showMarkerPanel, setShowMarkerPanel] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingComment, setPendingComment] = useState('');

  const baseFontSize = 16;
  const currentSize = baseFontSize * fontSizeMultiplier;

  const performScrollToPage = (target: string) => {
    const exactY = yOffsets.current[target];
    if (exactY !== undefined) {
      pendingReaderAnchorRef.current = null;
      scrollViewRef.current?.scrollTo({ y: exactY, animated: false });
      return;
    }
    const targetNum = parseInt(target, 10);
    const pages = Object.keys(yOffsets.current).map(Number).filter(n => !isNaN(n));
    if (pages.length) {
      const closest = pages.reduce((a, b) => (Math.abs(b - targetNum) < Math.abs(a - targetNum) ? b : a));
      const closestY = yOffsets.current[String(closest)];
      if (closestY !== undefined) {
        pendingReaderAnchorRef.current = null;
        scrollViewRef.current?.scrollTo({ y: closestY, animated: false });
        return;
      }
    }
    if (totalContentHeightRef.current > 0 && totalPages > 0) {
      const ratio = (targetNum - 1) / totalPages;
      pendingReaderAnchorRef.current = null;
      scrollViewRef.current?.scrollTo({ y: totalContentHeightRef.current * ratio, animated: false });
    }
  };

  const handleContentSizeChange = (_w: number, h: number) => {
    if (h > 0) totalContentHeightRef.current = h;
    if (!pendingReaderAnchorRef.current) return;
    if (contentSizeTimerRef.current) clearTimeout(contentSizeTimerRef.current);
    contentSizeTimerRef.current = setTimeout(() => {
      if (!pendingReaderAnchorRef.current) return;
      performScrollToPage(pendingReaderAnchorRef.current);
    }, 80);
  };

  useEffect(() => {
    if (!isReadingMode) return;
    const timer = setTimeout(() => {
      if (!pendingReaderAnchorRef.current) return;
      performScrollToPage(pendingReaderAnchorRef.current);
    }, 1000);
    return () => clearTimeout(timer);
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

  const handleToggleMode = () => {
    const nextMode = !isReadingMode;
    if (nextMode) {
      yOffsets.current = {};
      pageViewRefs.current = {};
      totalContentHeightRef.current = 0;
      pendingReaderAnchorRef.current = currentPage.toString();
      hasScrolledToAnchorRef.current = false;
    } else {
      pendingReaderAnchorRef.current = null;
    }
    setIsReadingMode(nextMode);
  };

  const handleScroll = (event: any) => {
    if (pendingReaderAnchorRef.current) return;
    if (!isReadingMode) return;
    const scrollY = event.nativeEvent.contentOffset.y;
    let bestPage = currentPage;
    let maxY = -1;
    for (const [pageStr, yPos] of Object.entries(yOffsets.current)) {
      if (yPos <= scrollY + 100 && yPos > maxY) {
        maxY = yPos;
        bestPage = parseInt(pageStr, 10);
      }
    }
    if (bestPage !== currentPage && bestPage > 0) {
      setCurrentPage(bestPage);
    }
  };

  const handleAddMarker = () => {
    const label = pendingComment.trim() || `Marker ${markers.length + 1}`;
    addMarker(book.id, { page: currentPage, label });
    setPendingComment('');
    setShowAddModal(false);
  };

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: 60 }]}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => router.back()} style={{ paddingRight: 12 }}>
            <ChevronLeft color="#fff" size={28} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{book.title}</Text>
            {!isReadingMode && (
              <Text style={styles.pageTracker}>Page {currentPage} of {totalPages || '?'}</Text>
            )}
          </View>
        </View>

        <View style={styles.headerRight}>
          {isReadingMode && (
            <View style={styles.fontControls}>
              <Pressable
                onPress={() => {
                  pendingReaderAnchorRef.current = currentPage.toString();
                  hasScrolledToAnchorRef.current = false;
                  setFontSizeMultiplier(prev => Math.max(0.5, prev - 0.2));
                }}
                style={styles.fontBtn}
              >
                <ZoomOut color="#ccc" size={18} />
              </Pressable>
              <Pressable
                onPress={() => {
                  pendingReaderAnchorRef.current = currentPage.toString();
                  hasScrolledToAnchorRef.current = false;
                  setFontSizeMultiplier(prev => Math.min(3.0, prev + 0.2));
                }}
                style={styles.fontBtn}
              >
                <ZoomIn color="#ccc" size={18} />
              </Pressable>
            </View>
          )}
          <Pressable style={styles.modeToggle} onPress={handleToggleMode}>
            {isReadingMode ? <FileText color="#fff" size={20} /> : <BookOpen color="#fff" size={20} />}
            <Text style={styles.modeToggleText}>{isReadingMode ? 'Original' : 'Reader'}</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Content ── */}
      {isReadingMode ? (
        <View style={styles.responsiveReaderCanvas}>
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={100}
            onContentSizeChange={handleContentSizeChange}
          >
            <Markdown
              rules={{
                paragraph: (node, children) => {
                  let rawText = '';
                  if (node.children && Array.isArray(node.children)) {
                    rawText = node.children.map((c: any) => c.content || '').join('').trim();
                  } else if (node.content) {
                    rawText = node.content.trim();
                  }
                  const pageMatch = rawText.match(/\[%%%PAGE_(\d+)%%%\]/);
                  if (pageMatch) {
                    const pNo = pageMatch[1];
                    return (
                      <View
                        key={node.key}
                        ref={(ref: View | null) => { pageViewRefs.current[pNo] = ref; }}
                        onLayout={() => {
                          requestAnimationFrame(() => {
                            const v = pageViewRefs.current[pNo];
                            const scrollNode = findNodeHandle(scrollViewRef.current);
                            if (!v || !scrollNode) return;
                            v.measureLayout(scrollNode as any, (_x, y) => {
                              yOffsets.current[pNo] = y;
                            }, () => {});
                          });
                        }}
                      >
                        <View style={{ marginVertical: 32, alignItems: 'center', opacity: 0.5 }}>
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 2 }}>
                            — PAGE {pNo} —
                          </Text>
                        </View>
                      </View>
                    );
                  }
                  return (
                    <View key={node.key} style={{ marginBottom: 16 }}>
                      {children}
                    </View>
                  );
                },
                image: (node) => (
                  <Image
                    key={node.key}
                    style={{ width: '100%', aspectRatio: 1.5, resizeMode: 'contain', marginVertical: 16 }}
                    source={{ uri: node.attributes.src }}
                    alt={node.attributes.alt}
                  />
                ),
              }}
              style={{
                body: { color: '#e0e0e0', fontSize: currentSize, lineHeight: currentSize * 1.6, letterSpacing: 0.2 },
                heading1: { color: '#fff', marginTop: 24, marginBottom: 12, fontSize: currentSize * 1.5, letterSpacing: 0.3 },
                heading2: { color: '#fff', marginTop: 20, marginBottom: 10, fontSize: currentSize * 1.3, letterSpacing: 0.3 },
                list_item: { color: '#e0e0e0', fontSize: currentSize, marginBottom: 4, letterSpacing: 0.2 },
              }}
            >
              {book.text || 'Loading markdown...'}
            </Markdown>
          </ScrollView>
        </View>
      ) : (
        <>
          <Pdf
            page={currentPage}
            source={{ uri: book.uri, cache: true }}
            onLoadComplete={(numberOfPages) => setTotalPages(numberOfPages)}
            onPageChanged={(p) => setCurrentPage(p)}
            onError={(error) => console.log('PDF Render Error:', error)}
            onLongPress={() => setShowAddModal(true)}
            style={styles.pdf}
            trustAllCerts={false}
          />

          {/* ── Marker FAB ── */}
          <Pressable style={styles.markerFab} onPress={() => setShowMarkerPanel(true)}>
            <BookmarkPlus color="#111" size={22} />
            {markers.length > 0 && (
              <View style={styles.markerBadge}>
                <Text style={styles.markerBadgeText}>{markers.length}</Text>
              </View>
            )}
          </Pressable>

          {/* ── Marker Panel ── */}
          <Modal
            visible={showMarkerPanel}
            transparent
            animationType="slide"
            onRequestClose={() => setShowMarkerPanel(false)}
          >
            <Pressable style={styles.panelBackdrop} onPress={() => setShowMarkerPanel(false)} />
            <View style={styles.markerPanel}>
              <View style={styles.panelHandle} />
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Markers</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Pressable
                    style={styles.addHereBtn}
                    onPress={() => { setShowMarkerPanel(false); setShowAddModal(true); }}
                  >
                    <Text style={styles.addHereText}>+ Add here</Text>
                  </Pressable>
                  <Pressable onPress={() => setShowMarkerPanel(false)} hitSlop={8}>
                    <X color="#888" size={20} />
                  </Pressable>
                </View>
              </View>

              {markers.length === 0 ? (
                <View style={styles.panelEmpty}>
                  <Text style={styles.panelEmptyText}>No markers yet.</Text>
                  <Text style={styles.panelEmptySub}>Long press on any page to add one.</Text>
                </View>
              ) : (
                <FlatList
                  data={[...markers].sort((a, b) => a.page - b.page)}
                  keyExtractor={(m) => m.id}
                  contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
                  renderItem={({ item }) => (
                    <Pressable
                      style={styles.markerItem}
                      onPress={() => { setCurrentPage(item.page); setShowMarkerPanel(false); }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.markerLabel}>{item.label}</Text>
                      </View>
                      <Text style={styles.markerPageNum}>p. {item.page}</Text>
                      <Pressable
                        hitSlop={10}
                        onPress={() => removeMarker(book.id, item.id)}
                      >
                        <Trash2 color="#ff4444" size={16} />
                      </Pressable>
                    </Pressable>
                  )}
                />
              )}
            </View>
          </Modal>

          {/* ── Add Marker Modal ── */}
          <Modal
            visible={showAddModal}
            transparent
            animationType="fade"
            onRequestClose={() => { setShowAddModal(false); setPendingComment(''); }}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.addModalWrap}
            >
              <Pressable
                style={StyleSheet.absoluteFillObject}
                onPress={() => { setShowAddModal(false); setPendingComment(''); }}
              />
              <View style={styles.addModal}>
                <Text style={styles.addModalTitle}>Add Marker</Text>
                <Text style={styles.addModalPage}>Page {currentPage}</Text>
                <TextInput
                  style={styles.addModalInput}
                  placeholder="Add a note (optional)"
                  placeholderTextColor="#555"
                  value={pendingComment}
                  onChangeText={setPendingComment}
                  returnKeyType="done"
                  onSubmitEditing={handleAddMarker}
                  autoFocus
                />
                <View style={styles.addModalBtns}>
                  <Pressable
                    style={styles.cancelBtn}
                    onPress={() => { setShowAddModal(false); setPendingComment(''); }}
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={styles.confirmBtn} onPress={handleAddMarker}>
                    <Text style={styles.confirmText}>Add</Text>
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 8,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingRight: 16 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#fff', fontSize: 16, fontWeight: '700' },
  pageTracker: { color: '#aaa', fontSize: 14, marginTop: 4 },
  fontControls: { flexDirection: 'row', backgroundColor: '#222', borderRadius: 8, overflow: 'hidden' },
  fontBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRightWidth: 1, borderRightColor: '#111' },
  modeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#444',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modeToggleText: { color: '#fff', marginLeft: 6, fontSize: 14, fontWeight: '600' },
  responsiveReaderCanvas: { flex: 1 },
  scrollContent: { padding: 12, paddingBottom: 100 },
  pdf: { flex: 1, width: Dimensions.get('window').width, backgroundColor: '#111' },

  // ── Marker FAB ──
  markerFab: {
    position: 'absolute',
    bottom: 36,
    right: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  markerBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#6c63ff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  markerBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  // ── Marker Panel ──
  panelBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  markerPanel: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    paddingBottom: 8,
  },
  panelHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#444',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  panelTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  addHereBtn: {
    backgroundColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addHereText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  panelEmpty: { alignItems: 'center', paddingVertical: 40 },
  panelEmptyText: { color: '#888', fontSize: 16, fontWeight: '600' },
  panelEmptySub: { color: '#555', fontSize: 13, marginTop: 6 },
  markerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#242424',
    gap: 12,
  },
  markerLabel: { color: '#eee', fontSize: 15, fontWeight: '500' },
  markerPageNum: { color: '#888', fontSize: 13, minWidth: 40, textAlign: 'right' },

  // ── Add Marker Modal ──
  addModalWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  addModal: {
    backgroundColor: '#1e1e1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 36,
  },
  addModalTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  addModalPage: { color: '#888', fontSize: 13, marginBottom: 20 },
  addModalInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 15,
    marginBottom: 20,
  },
  addModalBtns: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
  },
  cancelText: { color: '#aaa', fontWeight: '600', fontSize: 15 },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  confirmText: { color: '#111', fontWeight: '700', fontSize: 15 },
});
