import { useRef, useEffect } from 'react';

export function useMounted() {
    const isMounted = useRef(false);

    useEffect(() => {
        isMounted.current = true;
        // When the component unmounts, flip the switch off
        return () => {
            isMounted.current = false;
        };
    }, []);

    return isMounted;
}
