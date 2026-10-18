// This will contain all course description and details
# ifndef CHULA_COURSE_DATABASE_H
# define CHULA_COURSE_DATABASE_H

// including libraries
# include <iostream> 
# include <string> 
# include <map> 
# include <vector>
# include <set>
# include <utility> 
# include <algorithm> 
# include "cp_chula_course_structure.h"
using namespace std ; 

// create course for each semester (only for required/mandatory courses)
vector< pair<string , string> > grade_y1s1 = {{"2301107","C"} , {"2100111","A"} , {"2110101","A"} , {"2304103","C"} , {"2304183","A"} , {"5500111","B"} } ; 
vector< pair<string , string> > grade_y1s2 = {{"2301108","C"} , {"2302127","C"} , {"2302163","C+"} , {"2304104","B"} , {"2304184","A"} , {"5500112","B"} , {"2110215","B"} , {"2110221","B"} } ;

vector< pair<string , string> > grade_y2s1 = {{"2110200","D+"} , {"2110211","C+"} , {"2110251","B"} , {"2110263","A"} , {"2603284","B+"} } ;
vector< pair<string , string> > grade_y2s2 = {{"2110201","B"} , {"2110313","B+"} , {"2110322","B"} , {"2110327","C"} , {"2110352","C+"} , {"2110363","B+"} , {"5500208","B"} } ;

vector< pair<string , string> > grade_y3s1 = {{"2110203","D"} , {"2110426","B+"} , {"2110318","A"} , {"2110366","B+"} , {"2110423","C+"} } ;
vector< pair<string , string> > grade_y3s2 = {{"5500308","B"} } ;

vector< pair<string , string> > grade_other = {{"2100301","S"} , {"2110488","A"} , {"2110489","A"} } ;


// year 1 semester 1
Course calculus1 = Course("2301107" , "CALCULUS I" , 3) ; 
Course genphys1 = Course("2304104" , "GENERAL PHYSICS I" , 3);
Course genphyslab1 = Course("2304184" , "GENERAL PHYSICS LAB I" , 1);





















// end of defining course structure
# endif

