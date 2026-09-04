import React from 'react';
import logoSrc from '../assets/bloomlex-logo.png';

export function Logo() {
  return (
    <img src={logoSrc} alt="BloomLex" className="h-8 w-auto object-contain object-left" />
  );
}
