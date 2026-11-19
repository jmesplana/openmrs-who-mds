import React from 'react';
import { ConfigurableLink } from '@openmrs/esm-framework';

export default function AppMenuLink() {
  return <ConfigurableLink to="${openmrsSpaBase}/who-mds">WHO EMT MDS</ConfigurableLink>;
}
