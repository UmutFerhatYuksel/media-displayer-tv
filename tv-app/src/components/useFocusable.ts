import { useRef, useState } from 'react';
import { findNodeHandle, useTVEventHandler } from 'react-native';

// Bu react-native-tvos sürümünde Touchable/Pressable'ın onFocus prop'u Android TV'de
// ateşlenmiyor. Bunun yerine global 'focus' olaylarını dinleyip odaklanan view'in
// native tag'ini kendi tag'imizle karşılaştırarak odak durumunu kendimiz çıkarıyoruz.
// (HomeScreen'deki yöntemin yeniden kullanılabilir hâli.)
export function useFocusable<T>(autoFocus = false) {
  const ref = useRef<T | null>(null);
  const tagRef = useRef<number | null>(null);
  const [focused, setFocused] = useState(autoFocus);

  useTVEventHandler((evt: any) => {
    if (evt?.eventType !== 'focus' || typeof evt.target !== 'number') return;
    if (tagRef.current == null && ref.current) {
      tagRef.current = findNodeHandle(ref.current as any);
    }
    // Odak bize geldiyse true, başka bir view'e gittiyse false.
    setFocused(evt.target === tagRef.current);
  });

  return { ref, focused };
}
