import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

// How tall the on-screen keyboard is right now (0 when hidden).
// Forms use it to add scroll space so the keyboard never hides a field.
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
