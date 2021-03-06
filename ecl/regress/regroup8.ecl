/*##############################################################################

    HPCC SYSTEMS software Copyright (C) 2012 HPCC Systems®.

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
############################################################################## */



inrec := record
unsigned6 did;
    end;

outrec := record(inrec)
string20        name;
unsigned        score;
          end;

nameRec := record
string20        name;
            end;

finalRec := record(inrec)
dataset(nameRec)    names;
string20            secondName;
          end;

ds := dataset([1,2,3,4,5,6], inrec);

dsg := group(ds, row);

i1 := dataset([
            {1, 'Gavin', 10},
            {2, 'Richard', 5},
            {5,'Nigel', 2},
            {0, '', 0}], outrec);
i2 := dataset([
            {1, 'Gavin Hawthorn', 12},
            {2, 'Richard Drimbad', 15},
            {3, 'Zack Smith', 20},
            {5,'Nigel Hewit', 100},
            {0, '', 0}], outrec);
i3 := dataset([
            {1, 'Hawthorn', 8},
            {2, 'Richard', 8},
            {6, 'Paul', 4},
            {6, 'Peter', 8},
            {6, 'Petie', 1},
            {0, '', 0}], outrec);

combined := dsg(false);

finalRec doRollup(inRec l, dataset(inRec) allRows) := transform
    self.did  := l.did;
    self.names := [];
    self.secondName := [];
    end;

results := rollup(combined, group, doRollup(left, rows(left)));

output(table(results, { count(group)}));

// Should return a single count of 0

