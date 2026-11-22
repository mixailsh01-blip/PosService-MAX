#!/usr/bin/env python3
"""Extract training flags only from a plain pg_dump backup; never print secrets."""
import gzip
import json
import re
import sys

LESSONS = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6']

def decode_copy(value):
    if value == r'\N':
        return None
    def replace(match):
        escaped = match.group(1)
        if re.fullmatch(r'[0-7]{1,3}', escaped):
            return chr(int(escaped, 8))
        if re.fullmatch(r'x[0-9a-fA-F]{1,2}', escaped):
            return chr(int(escaped[1:], 16))
        return {'b': '\b', 'f': '\f', 'n': '\n', 'r': '\r', 't': '\t', 'v': '\v'}.get(escaped, escaped)
    return re.sub(r'\\([0-7]{1,3}|x[0-9a-fA-F]{1,2}|.)', replace, value)

def extract(lines):
    columns = None
    result = []
    for line in lines:
        if columns is None:
            match = re.match(r'COPY (?:"?public"?\.)?"UserSettings" \((.*?)\) FROM stdin;', line)
            if match:
                columns = [value.strip().strip('"') for value in match.group(1).split(',')]
            continue
        if line.rstrip('\r\n') == r'\.':
            columns = None
            continue
        row = dict(zip(columns, [decode_copy(value) for value in line.rstrip('\r\n').split('\t')]))
        properties = json.loads(row.get('properties') or '{}')
        if isinstance(properties, str):
            properties = json.loads(properties)
        old = properties.get('SPRT_LEARN', {})
        progress = {key: old.get(key) is True for key in LESSONS}
        if not any(progress.values()):
            continue
        # Only a sequential completed prefix is eligible for automatic migration.
        flags = list(progress.values())
        if any(flags[i] and not flags[i-1] for i in range(1, len(flags))):
            continue
        result.append({'uid': row['userUid'], 'progress': progress,
                       'attempt': 1 + sum(bool(value) for key, value in old.items() if re.fullmatch(r'r\d+', key))})
    return result

if __name__ == '__main__':
    with gzip.open(sys.argv[1], 'rt', encoding='utf-8') as stream:
        print(json.dumps(extract(stream), ensure_ascii=False))
