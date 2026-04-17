'use client';

import * as React from 'react';
import { Input, type InputProps } from '@/components/ui/input';
import { formatPercent, parsePercent } from '@/lib/utils';

interface PercentInputProps extends Omit<InputProps, 'onChange' | 'value'> {
  value: number | null | undefined;
  onChange: (value: number) => void;
}

const PercentInput = React.forwardRef<HTMLInputElement, PercentInputProps>(
  ({ value, onChange, onBlur, onFocus, ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState(() => formatPercent(value));
    const [isFocused, setIsFocused] = React.useState(false);

    // This effect syncs the display value with the external `value` prop.
    // It's crucial to only run this when the input is NOT focused,
    // otherwise it will interfere with the user typing by re-formatting the value.
    React.useEffect(() => {
        if (!isFocused) {
            setDisplayValue(formatPercent(value));
        }
    }, [value, isFocused]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      // Keep the display value exactly as the user types it.
      setDisplayValue(val);
      // Parse the user input to a number and inform the parent component.
      const numericValue = parsePercent(val);
      onChange(numericValue);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(true);
        if (onFocus) onFocus(e);
    }
    
    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(false);
        // We get the latest value from the parent and format it.
        // We don't parse from e.target.value because the parent's `value` is the source of truth.
        setDisplayValue(formatPercent(value));
        if (onBlur) {
            onBlur(e);
        }
    };

    return (
      <div className="relative">
        <Input
          {...props}
          ref={ref}
          value={displayValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      </div>
    );
  }
);
PercentInput.displayName = 'PercentInput';

export { PercentInput };
